import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { submitPunch, requestDeviceApproval } from "@/lib/punch.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin,
  Camera,
  ShieldAlert,
  Smartphone,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Punch In · J2W Attendance" }] }),
  component: PunchPage,
});

type DeviceState =
  | { kind: "loading" }
  | { kind: "approved"; fingerprint: string }
  | { kind: "pending"; fingerprint: string }
  | { kind: "unregistered"; fingerprint: string };

type PermissionState = "unknown" | "granted" | "denied" | "prompt";

function detectMockLocation(pos: GeolocationPosition): boolean {
  // Best-effort heuristics in the browser: synthetic 0/0, perfect 0m accuracy, etc.
  if (pos.coords.accuracy === 0) return true;
  if (pos.coords.latitude === 0 && pos.coords.longitude === 0) return true;
  return false;
}

function PunchPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [device, setDevice] = useState<DeviceState>({ kind: "loading" });
  const [perm, setPerm] = useState<PermissionState>("unknown");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string>("");
  const [lastResult, setLastResult] = useState<
    | null
    | { ok: true; type: string; geofence: string; at: string }
    | { ok: false; reason: string }
  >(null);
  const [todayCount, setTodayCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // load device state + today's events
  useEffect(() => {
    if (!user) return;
    (async () => {
      const fp = await getDeviceFingerprint();
      const { data: approved } = await supabase
        .from("user_devices")
        .select("id")
        .eq("user_id", user.id)
        .eq("fingerprint", fp)
        .maybeSingle();
      if (approved) {
        setDevice({ kind: "approved", fingerprint: fp });
      } else {
        const { data: pending } = await supabase
          .from("pending_devices")
          .select("id")
          .eq("user_id", user.id)
          .eq("fingerprint", fp)
          .maybeSingle();
        setDevice({ kind: pending ? "pending" : "unregistered", fingerprint: fp });
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("attendance_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("ts_utc", dayStart.toISOString());
      setTodayCount(count ?? 0);
    })();
  }, [user]);

  // poll permission state for display
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await (
          navigator.permissions as Permissions
        ).query({ name: "geolocation" as PermissionName });
        if (cancelled) return;
        setPerm(status.state as PermissionState);
        status.onchange = () => setPerm(status.state as PermissionState);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitPunchFn = useServerFn(submitPunch);
  const requestApprovalFn = useServerFn(requestDeviceApproval);

  async function captureSelfie(): Promise<string | null> {
    if (!user) return null;
    setStatusLine("Capturing liveness selfie…");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 480, height: 480 },
      audio: false,
    });
    try {
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      // Brief delay so the sensor warms up — basic liveness placeholder.
      await new Promise((r) => setTimeout(r, 800));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")!.drawImage(video, 0, 0);
      const blob: Blob | null = await new Promise((r) =>
        canvas.toBlob((b) => r(b), "image/jpeg", 0.7),
      );
      if (!blob) return null;
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("selfies").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (error) {
        console.error(error);
        return null;
      }
      return path;
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  async function getFreshLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      // Re-check permission live every punch — never cached.
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      });
    });
  }

  async function doPunch(eventType: "punch_in" | "punch_out") {
    if (!user) return;
    if (device.kind !== "approved") {
      toast.error("Device not approved");
      return;
    }
    setBusy(true);
    setLastResult(null);
    try {
      setStatusLine("Checking location permission…");
      if (
        typeof navigator !== "undefined" &&
        "permissions" in navigator
      ) {
        try {
          const p = await (navigator.permissions as Permissions).query({
            name: "geolocation" as PermissionName,
          });
          if (p.state === "denied") {
            throw new Error(
              "Location permission is blocked. Enable Precise Location in your browser settings and reload.",
            );
          }
        } catch {
          /* fall through */
        }
      }

      setStatusLine("Acquiring fresh GPS fix…");
      const pos = await getFreshLocation();
      const mock = detectMockLocation(pos);

      const selfiePath = await captureSelfie();
      if (!selfiePath) {
        throw new Error("Camera access required for liveness selfie.");
      }

      setStatusLine("Validating punch on server…");
      const res = await submitPunchFn({
        data: {
          event_type: eventType,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
          fingerprint: device.fingerprint,
          selfie_path: selfiePath,
          mock_flag: mock,
          client_anomalies: [],
        },
      });

      if (res.ok) {
        setLastResult({
          ok: true,
          type: res.event!.event_type,
          geofence: res.geofence!,
          at: res.event!.ts_utc,
        });
        setTodayCount((c) => c + 1);
        toast.success(`${eventType === "punch_in" ? "Punched in" : "Punched out"} ✓`);
      } else {
        setLastResult({ ok: false, reason: res.reason });
        toast.error(res.reason);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Punch failed";
      setLastResult({ ok: false, reason: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
      setStatusLine("");
    }
  }

  async function registerThisDevice() {
    if (device.kind === "loading") return;
    const res = await requestApprovalFn({
      data: {
        fingerprint: device.fingerprint,
        user_agent: navigator.userAgent.slice(0, 500),
      },
    });
    if (res.status === "pending") {
      setDevice({ kind: "pending", fingerprint: device.fingerprint });
      toast.success("Device submitted for HR approval.");
    } else if (res.status === "approved") {
      setDevice({ kind: "approved", fingerprint: device.fingerprint });
    } else {
      toast.error("Could not submit device.");
    }
  }

  if (loading || !user) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const permLabel: Record<PermissionState, string> = {
    unknown: "Unknown",
    prompt: "Will prompt",
    granted: "Granted",
    denied: "Blocked",
  };
  const permTone =
    perm === "granted"
      ? "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-[var(--success)]"
      : perm === "denied"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
      <Card className="overflow-hidden border-border shadow-[var(--shadow-card)]">
        <CardHeader className="bg-[var(--gradient-brand)] text-primary-foreground">
          <CardTitle className="text-lg font-medium opacity-80">Today</CardTitle>
          <div className="text-3xl font-semibold">
            {todayCount === 0 ? "Not yet punched in" : `${todayCount} event(s) today`}
          </div>
          <div className="text-sm opacity-80">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <PreCheck
              icon={<Smartphone className="h-4 w-4" />}
              label="Device"
              value={
                device.kind === "approved"
                  ? "Approved"
                  : device.kind === "pending"
                    ? "Pending approval"
                    : device.kind === "unregistered"
                      ? "Not registered"
                      : "…"
              }
              ok={device.kind === "approved"}
            />
            <PreCheck
              icon={<MapPin className="h-4 w-4" />}
              label="Location"
              value={permLabel[perm]}
              ok={perm === "granted"}
              tone={permTone}
            />
            <PreCheck
              icon={<Camera className="h-4 w-4" />}
              label="Camera"
              value="Prompted on punch"
              ok={true}
            />
          </div>

          {device.kind !== "approved" && (
            <div className="rounded-md border border-warning/30 bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] p-4 text-sm">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--warning)]" />
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    This device is {device.kind === "pending" ? "awaiting HR approval" : "not registered"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Max 2 devices per employee. Punch is blocked until HR Admin approves.
                  </div>
                  {device.kind === "unregistered" && (
                    <Button size="sm" className="mt-3" onClick={registerThisDevice}>
                      Submit device for approval
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              className="h-16 text-base"
              disabled={busy || device.kind !== "approved"}
              onClick={() => doPunch("punch_in")}
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Punch In
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 text-base"
              disabled={busy || device.kind !== "approved"}
              onClick={() => doPunch("punch_out")}
            >
              Punch Out
            </Button>
          </div>

          {busy && statusLine && (
            <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
              {statusLine}
            </div>
          )}

          {lastResult && lastResult.ok && (
            <div className="flex items-start gap-3 rounded-md border border-[color-mix(in_oklab,var(--success)_30%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--success)]" />
              <div className="text-sm">
                <div className="font-medium text-foreground">
                  {lastResult.type === "punch_in" ? "Punched in" : "Punched out"}
                </div>
                <div className="text-muted-foreground">
                  Geofence: {lastResult.geofence.replace("inside_", "")} · {" "}
                  {new Date(lastResult.at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          )}
          {lastResult && !lastResult.ok && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
              <XCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="text-sm">
                <div className="font-medium text-foreground">Punch rejected</div>
                <div className="text-muted-foreground">{lastResult.reason}</div>
              </div>
            </div>
          )}

          <video ref={videoRef} className="hidden" playsInline muted />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Security checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <SecurityRow ok label="Fresh GPS fix on every punch (no cache)" />
          <SecurityRow ok label="GPS accuracy ≤ 100m enforced server-side" />
          <SecurityRow ok label="Mock-location detection blocks punch & flags account" />
          <SecurityRow ok label="Geofence (Haversine) re-validated by server" />
          <SecurityRow ok label="Liveness selfie captured & stored privately" />
          <SecurityRow ok label="Device fingerprint bound — max 2 per employee" />
          <SecurityRow ok label="Append-only event log (no UPDATE, no DELETE)" />
        </CardContent>
      </Card>
    </div>
  );
}

function PreCheck({
  icon,
  label,
  value,
  ok,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{value}</span>
        <Badge className={tone ?? (ok ? "bg-[var(--success)]/15 text-[var(--success)]" : "bg-muted text-muted-foreground")}>
          {ok ? "OK" : "Action"}
        </Badge>
      </div>
    </div>
  );
}

function SecurityRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--success)]" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
      )}
      <span>{label}</span>
    </div>
  );
}