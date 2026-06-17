import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { evaluateGeofence } from "./geo";

const PunchInput = z.object({
  event_type: z.enum(["punch_in", "punch_out"]),
  lat: z.number(),
  lng: z.number(),
  accuracy_m: z.number().nonnegative(),
  fingerprint: z.string().min(4),
  selfie_path: z.string().nullable().optional(),
  mock_flag: z.boolean().default(false),
  client_anomalies: z.array(z.string()).default([]),
});

export const submitPunch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PunchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const anomalies: string[] = [...data.client_anomalies];

    // 1. Server-side accuracy gate
    if (data.accuracy_m > 100) {
      return {
        ok: false as const,
        reason: `GPS accuracy is ${Math.round(data.accuracy_m)}m. Must be 100m or better. Move to an open area.`,
      };
    }
    if (data.accuracy_m > 500) anomalies.push("accuracy_over_500");
    if (data.mock_flag) anomalies.push("mock_location_suspected");

    // 2. Device must be approved
    const { data: device } = await supabase
      .from("user_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("fingerprint", data.fingerprint)
      .maybeSingle();
    if (!device) {
      return {
        ok: false as const,
        reason:
          "This device is not approved for your account. Submit it for HR approval from the device registration screen.",
      };
    }

    // 3. Geofence check
    const { data: cfg } = await supabase
      .from("employee_config")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!cfg) {
      return {
        ok: false as const,
        reason: "Your office/home geofence is not configured. Contact HR.",
      };
    }
    const geo = evaluateGeofence(data.lat, data.lng, cfg);
    if (geo.status === "no_config") {
      return {
        ok: false as const,
        reason: "No office or home location configured. Contact HR.",
      };
    }
    if (geo.status === "outside") {
      return {
        ok: false as const,
        reason: `Outside geofence. Nearest configured location is ${Math.round(geo.nearest_m)}m away.`,
      };
    }

    // 4. Mock blocks the punch
    if (data.mock_flag) {
      // Still log to audit so HR sees the attempt
      await supabase.from("audit_events").insert({
        actor_id: userId,
        action: "punch_blocked_mock_location",
        target: "attendance",
        payload: { lat: data.lat, lng: data.lng, fingerprint: data.fingerprint },
      });
      return {
        ok: false as const,
        reason: "Mock location detected. Punch blocked and security flag raised.",
      };
    }

    // 5. Insert append-only event
    const { data: inserted, error } = await supabase
      .from("attendance_events")
      .insert({
        user_id: userId,
        device_fingerprint: data.fingerprint,
        event_type: data.event_type,
        lat: data.lat,
        lng: data.lng,
        accuracy_m: data.accuracy_m,
        geofence_status: geo.status,
        mock_flag: data.mock_flag,
        selfie_path: data.selfie_path ?? null,
        anomaly_flags: anomalies,
      })
      .select("id, ts_utc, geofence_status, event_type")
      .single();

    if (error) {
      return { ok: false as const, reason: `Failed to record punch: ${error.message}` };
    }

    return {
      ok: true as const,
      event: inserted,
      geofence: geo.status,
    };
  });

const RegisterDeviceInput = z.object({
  fingerprint: z.string().min(4),
  user_agent: z.string().max(500),
});

export const requestDeviceApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterDeviceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // already approved?
    const { data: existing } = await supabase
      .from("user_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("fingerprint", data.fingerprint)
      .maybeSingle();
    if (existing) return { status: "approved" as const };

    // already pending?
    const { data: pending } = await supabase
      .from("pending_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("fingerprint", data.fingerprint)
      .maybeSingle();
    if (pending) return { status: "pending" as const };

    const { error } = await supabase.from("pending_devices").insert({
      user_id: userId,
      fingerprint: data.fingerprint,
      user_agent: data.user_agent,
    });
    if (error) return { status: "error" as const, message: error.message };
    return { status: "pending" as const };
  });

const ApproveInput = z.object({ pending_id: z.string().uuid(), label: z.string().optional() });

export const approveDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApproveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: pending, error: pErr } = await supabase
      .from("pending_devices")
      .select("*")
      .eq("id", data.pending_id)
      .single();
    if (pErr || !pending) throw new Error("Pending device not found");

    const { count } = await supabase
      .from("user_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", pending.user_id);
    if ((count ?? 0) >= 2) {
      return { ok: false as const, reason: "User already has 2 approved devices. Revoke one first." };
    }

    const { error: iErr } = await supabase.from("user_devices").insert({
      user_id: pending.user_id,
      fingerprint: pending.fingerprint,
      user_agent: pending.user_agent,
      label: data.label ?? null,
      approved_by: userId,
    });
    if (iErr) return { ok: false as const, reason: iErr.message };

    await supabase.from("pending_devices").delete().eq("id", pending.id);
    await supabase.from("audit_events").insert({
      actor_id: userId,
      action: "device_approved",
      target: pending.user_id,
      payload: { fingerprint: pending.fingerprint },
    });
    return { ok: true as const };
  });