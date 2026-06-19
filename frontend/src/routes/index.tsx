import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import {
  submitPunchFn, getTodayEventsFn, getAttendanceStatsFn,
  getDeviceStatusFn, getEmployeeConfigFn, getCompanyConfigFn,
} from "@/backend/server-fns";
import type { AttendanceStats, EmployeeConfig } from "@/backend/server-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SwipeToPunch } from "@/components/SwipeToPunch";
import { GeofenceMap } from "@/components/GeofenceMap";
import { toast } from "sonner";
import {
  MapPin, Smartphone, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Clock, Building2, Home, Navigation,
  LogIn, LogOut, Wifi, WifiOff, Flame, AlarmClock, CalendarCheck, Timer, Bell,
} from "lucide-react";
import type { AttendanceEvent } from "@/backend/server-fns";

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Punch · J2W Attendance" }] }),
  component: PunchPage,
});

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

// Rotates daily so the home greeting feels fresh each day.
const DAILY_MESSAGES = [
  "Have a productive day!",
  "Make today count!",
  "Small steps, big results.",
  "You've got this 💪",
  "Stay focused, stay sharp.",
  "Great work starts now ✨",
  "One punch at a time.",
];

const SCHEDULE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  WFO: { label: "Work from Office", color: "bg-[#f6e6ee] text-[#8c2f52] border-[#ecccda]", icon: <Building2 className="h-3.5 w-3.5" /> },
  WFH: { label: "Work from Home", color: "bg-[#fdf3d4] text-[#8a6d2a] border-[#f0e2bd]", icon: <Home className="h-3.5 w-3.5" /> },
  OFF: { label: "Non-working Day", color: "bg-gray-100 text-gray-500 border-gray-200", icon: <XCircle className="h-3.5 w-3.5" /> },
  FLEX: { label: "Flexible", color: "bg-[#f6e6ee] text-[#8c2f52] border-[#ecccda]", icon: <Clock className="h-3.5 w-3.5" /> },
};

type PermState = "unknown" | "granted" | "denied" | "prompt";

type LocationPreview = {
  lat: number; lng: number; accuracy: number;
  geofenceLabel: string; geofenceColor: string;
} | null;

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function detectMock(pos: GeolocationPosition) {
  return pos.coords.accuracy === 0 || (pos.coords.latitude === 0 && pos.coords.longitude === 0);
}

function PunchPage() {
  const navigate = useNavigate();
  const { user, loading, isAdmin } = useAuth();
  const now = useLiveClock();

  const [fingerprint, setFingerprint] = useState("");
  const [deviceKind, setDeviceKind] = useState<"loading" | "approved" | "pending" | "unregistered">("loading");
  const [perm, setPerm] = useState<PermState>("unknown");
  const [locationPreview, setLocationPreview] = useState<LocationPreview>(null);
  const [locFetching, setLocFetching] = useState(false);
  const [todayEvents, setTodayEvents] = useState<AttendanceEvent[]>([]);
  const [scheduleType, setScheduleType] = useState("WFO");
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [lastPunch, setLastPunch] = useState<{ type: string; time: string; geo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [empConfig, setEmpConfig] = useState<EmployeeConfig | null>(null);
  const [office, setOffice] = useState<{ lat: number; lng: number; radius: number } | null>(null);
  const [shiftStart, setShiftStart] = useState("09:30");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (!loading && user && isAdmin) navigate({ to: "/admin/live" });
  }, [loading, user, isAdmin, navigate]);

  // Load device + today events + schedule
  useEffect(() => {
    if (!user) return;
    (async () => {
      const fp = await getDeviceFingerprint();
      setFingerprint(fp);
      const status = await getDeviceStatusFn({ data: { fingerprint: fp } });
      setDeviceKind(status.kind);

      const [events, cfg, s, company] = await Promise.all([
        getTodayEventsFn(),
        getEmployeeConfigFn(),
        getAttendanceStatsFn(),
        getCompanyConfigFn().catch(() => null),
      ]);
      setStats(s);
      if (cfg) setEmpConfig(cfg);
      setTodayEvents(events);
      // Prefer the employee's own office (per client/site); fall back to the
      // shared company office. Must mirror the backend geofence resolution.
      if (cfg && cfg.office_lat != null && cfg.office_lng != null) {
        setOffice({ lat: cfg.office_lat, lng: cfg.office_lng, radius: cfg.office_radius_m });
      } else if (company && company.office_lat != null && company.office_lng != null) {
        setOffice({ lat: company.office_lat, lng: company.office_lng, radius: company.office_radius_m ?? 300 });
      }
      if (company?.shift_start) setShiftStart(company.shift_start);
      if (cfg) {
        const dayKey = DAY_KEYS[new Date().getDay()];
        setScheduleType((cfg.weekly_schedule[dayKey] as string) ?? "WFO");
      }
    })();
  }, [user]);

  // Watch permission state
  useEffect(() => {
    if (typeof navigator === "undefined" || !("permissions" in navigator)) return;
    let cancelled = false;
    navigator.permissions.query({ name: "geolocation" }).then((s) => {
      if (cancelled) return;
      setPerm(s.state as PermState);
      s.onchange = () => setPerm(s.state as PermState);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function getLocation(): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true, maximumAge: 0, timeout: 30000,
      });
    });
  }

  // Preview location on demand
  async function previewLocation() {
    setLocFetching(true);
    const pos = await getLocation();
    setLocFetching(false);
    if (!pos) { toast.error("Could not get location. Check browser permissions."); return; }
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    // Client-side geofence preview against the resolved `office` (employee
    // office if set, else company office) — mirrors the backend punch check.
    let geofenceLabel = "Geofence not configured";
    let geofenceColor = "text-amber-600";
    if (office) {
      const distO = Math.round(haversineM(lat, lng, office.lat, office.lng));
      if (distO <= office.radius) { geofenceLabel = `Inside office zone (≤${office.radius}m)`; geofenceColor = "text-blue-600"; }
      else { geofenceLabel = `Outside office zone — ${distO}m from office`; geofenceColor = "text-red-600"; }
    }
    setLocationPreview({ lat, lng, accuracy: pos.coords.accuracy, geofenceLabel, geofenceColor });
  }


  async function doPunch(eventType: "punch_in" | "punch_out") {
    if (!user) return;
    setBusy(true);
    setError(null);
    setLastPunch(null);
    try {
      setStatusLine("Getting GPS fix…");
      const pos = await getLocation();
      const mock = pos ? detectMock(pos) : false;

      setStatusLine("Submitting punch…");
      const result = await submitPunchFn({ data: {
        event_type: eventType,
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
        accuracy_m: pos?.coords.accuracy ?? null,
        fingerprint,
        mock_flag: mock,
      } });

      if (result.ok) {
        const geo = result.geofence.replace("inside_", "");
        setLastPunch({ type: eventType, time: new Date(result.event.ts_utc).toLocaleTimeString(), geo });
        setTodayEvents((prev) => [...prev, result.event]);
        getAttendanceStatsFn().then(setStats);
        // Update location preview with actual geo from punch
        if (pos) {
          setLocationPreview({
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            geofenceLabel: geo === "no_config" ? "No geofence configured" : `Geofence: ${geo}`,
            geofenceColor: geo === "inside_office" || geo === "inside_home" ? "text-green-600" : "text-amber-600",
          });
        }
        toast.success(eventType === "punch_in" ? "✅ Punched in successfully" : "✅ Punched out successfully");
        if (result.warning) toast.warning(result.warning, { duration: 5000 });
      } else {
        setError(result.reason);
        toast.error(result.reason);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Punch failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setStatusLine("");
    }
  }

  if (loading || !user) {
    return (
      <div className="grid place-items-center py-32">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scheduleMeta = SCHEDULE_META[scheduleType] ?? SCHEDULE_META.WFO;
  const lastIn = [...todayEvents].reverse().find((e) => e.event_type === "punch_in");
  const lastOut = [...todayEvents].reverse().find((e) => e.event_type === "punch_out");
  const isPunchedIn = lastIn && (!lastOut || new Date(lastIn.ts_utc) > new Date(lastOut.ts_utc));

  // Working hours
  let workingMins = 0;
  let pairedEvents = [...todayEvents];
  while (pairedEvents.length >= 2) {
    const inEv = pairedEvents.find((e) => e.event_type === "punch_in");
    if (!inEv) break;
    const outEv = pairedEvents.find((e) => e.event_type === "punch_out" && new Date(e.ts_utc) > new Date(inEv.ts_utc));
    if (!inEv || !outEv) break;
    workingMins += (new Date(outEv.ts_utc).getTime() - new Date(inEv.ts_utc).getTime()) / 60000;
    pairedEvents = pairedEvents.filter((e) => e.id !== inEv.id && e.id !== outEv.id);
  }
  const workHrs = Math.floor(workingMins / 60);
  const workMin = Math.floor(workingMins % 60);

  const firstName = user.user_metadata.full_name.split(" ")[0];
  const initials = user.user_metadata.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // Date card bits
  const dayNum = now.getDate();
  const weekdayShort = now.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase();
  const weekdayLong = now.toLocaleDateString("en-IN", { weekday: "long" });
  const monthYear = now.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyMessage = DAILY_MESSAGES[dayOfYear % DAILY_MESSAGES.length];

  // Today's first-in / last-out for the punch block summary
  const firstInToday = todayEvents.find((e) => e.event_type === "punch_in");
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const isWorkingDay = scheduleType !== "OFF";

  return (
    <div className="space-y-4">
      {/* Greeting + avatar */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg,#8c2f52,#b8456e)" }}>
          {initials}
        </div>
        <div>
          <div className="text-base font-bold text-foreground leading-tight">Hi, {firstName} 👋</div>
          <div className="text-xs text-muted-foreground">{greeting}</div>
        </div>
      </div>

      {/* Date + dynamic daily message */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-sm"
          style={{ background: "linear-gradient(135deg,#8c2f52,#b8456e)" }}>
          <span className="text-2xl font-extrabold leading-none">{dayNum}</span>
          <span className="mt-0.5 text-[10px] font-semibold tracking-widest">{weekdayShort}</span>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{monthYear}, {weekdayLong}</div>
          <div className="text-lg font-bold text-foreground">{shiftStart} <span className="text-xs font-medium text-muted-foreground">shift start</span></div>
          <div className="text-sm font-semibold text-[#8c2f52]">{dailyMessage}</div>
        </div>
      </div>

      {/* Today's status */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-bold text-foreground">Today's Status</span>
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${isWorkingDay ? "text-green-700" : "text-gray-400"}`}>
          <span className={`h-2 w-2 rounded-full ${isWorkingDay ? "bg-green-500" : "bg-gray-300"}`} />
          {scheduleMeta.label}
        </span>
      </div>

      {/* ── Yellow punch block ── */}
      <div className="rounded-2xl border border-[#f0e2bd] bg-[#fdf3d4] p-4 sm:p-5 space-y-3">
        <div className="text-center text-4xl font-mono font-bold tabular-nums text-[#8c2f52]">
          {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>

        {/* In / Out summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/70 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Punch In</div>
            <div className="text-base font-bold text-foreground">{firstInToday ? fmtTime(firstInToday.ts_utc) : "--:--"}</div>
          </div>
          <div className="rounded-xl bg-white/70 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Punch Out</div>
            <div className="text-base font-bold text-foreground">{lastOut ? fmtTime(lastOut.ts_utc) : "--:--"}</div>
          </div>
        </div>

        {/* Warnings */}
        {scheduleType === "OFF" && (
          <div className="rounded-xl border border-gray-200 bg-white/70 p-3 text-sm text-gray-600">Non-working day — punch disabled.</div>
        )}
        {scheduleType === "WFH" && (
          <div className="flex items-center gap-2 rounded-xl border border-[#f0e2bd] bg-white/70 px-3 py-2 text-xs text-[#8a6d2a]">
            <Home className="h-3.5 w-3.5 shrink-0" />
            WFH day — valid within 100km of office. Location verified on punch.
          </div>
        )}

        {/* Swipe to punch */}
        <div className="space-y-2">
          {!isPunchedIn ? (
            <SwipeToPunch direction="in" busy={busy} disabled={scheduleType === "OFF"} onComplete={() => doPunch("punch_in")} />
          ) : (
            <SwipeToPunch direction="out" busy={busy} disabled={scheduleType === "OFF"} onComplete={() => doPunch("punch_out")} />
          )}
        </div>

        {busy && statusLine && (
          <div className="flex items-center gap-2 rounded-lg bg-white/70 px-4 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />{statusLine}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <div className="font-semibold text-red-800 text-sm">Punch Failed</div>
              <div className="text-xs text-red-700 mt-0.5">{error}</div>
            </div>
          </div>
        )}
      </div>

      {/* My Location */}
      <div className="rounded-2xl bg-white border border-border shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">My Location</h3>
          <button onClick={previewLocation} disabled={locFetching || perm === "denied"}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors">
            {locFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
            {locFetching ? "Getting…" : "Refresh"}
          </button>
        </div>
        {perm === "denied" ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div><div className="font-semibold">Location blocked</div><div className="mt-0.5 text-amber-700">Enable location for geofence verification.</div></div>
          </div>
        ) : locationPreview ? (
          <div className="space-y-2">
            <GeofenceMap
              current={{ lat: locationPreview.lat, lng: locationPreview.lng, accuracy: locationPreview.accuracy }}
              office={office}
              home={empConfig?.home_lat != null && empConfig?.home_lng != null
                ? { lat: empConfig.home_lat, lng: empConfig.home_lng, radius: empConfig.home_radius_m ?? 200 }
                : null}
              className="h-56 w-full rounded-xl overflow-hidden border border-border z-0"
            />
            <div className="rounded-xl bg-muted/40 p-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-muted-foreground">Lat</div><div className="font-mono font-semibold">{locationPreview.lat.toFixed(5)}</div></div>
                <div><div className="text-muted-foreground">Lng</div><div className="font-mono font-semibold">{locationPreview.lng.toFixed(5)}</div></div>
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground">±{Math.round(locationPreview.accuracy)}m accuracy</div>
            </div>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${locationPreview.geofenceColor}`}>
              <MapPin className="h-3 w-3" />{locationPreview.geofenceLabel}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {office && (
              <GeofenceMap
                current={null}
                office={office}
                home={empConfig?.home_lat != null && empConfig?.home_lng != null
                  ? { lat: empConfig.home_lat, lng: empConfig.home_lng, radius: empConfig.home_radius_m ?? 200 }
                  : null}
                className="h-56 w-full rounded-xl overflow-hidden border border-border z-0"
              />
            )}
            <div className="flex flex-col items-center gap-2 rounded-xl bg-muted/40 py-5 text-center">
              <MapPin className="h-6 w-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Click Refresh to see your live position on the map</p>
            </div>
          </div>
        )}
      </div>

      {/* This week */}
      <ThisWeek empConfig={empConfig} todayEvents={todayEvents} />

      {/* Today's Log */}
      {todayEvents.length > 0 && (
        <div className="rounded-2xl bg-white border border-border shadow-sm p-4 sm:p-5">
          <h3 className="font-semibold text-sm text-foreground mb-4">Today's Log</h3>
          <div className="space-y-0">
            {todayEvents.map((e, i) => {
              const isIn = e.event_type === "punch_in";
              const hasFlag = e.anomaly_flags.length > 0;
              return (
                <div key={e.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${isIn ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                      {isIn ? <LogIn className="h-3.5 w-3.5 text-green-600" /> : <LogOut className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    {i < todayEvents.length - 1 && <div className="w-px flex-1 bg-border my-1 min-h-[16px]" />}
                  </div>
                  <div className="pb-3 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-semibold ${isIn ? "text-green-700" : "text-red-600"}`}>{isIn ? "Punch In" : "Punch Out"}</span>
                      <span className="text-xs text-muted-foreground">{new Date(e.ts_utc).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      {hasFlag && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">⚠ flagged</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {e.geofence_status && (
                        <span className={`flex items-center gap-1 ${e.geofence_status.includes("office") ? "text-blue-600" : e.geofence_status.includes("home") ? "text-green-600" : e.geofence_status === "outside" ? "text-red-500" : ""}`}>
                          <MapPin className="h-3 w-3" />{e.geofence_status.replace("inside_", "").replace("_", " ")}
                        </span>
                      )}
                      {e.accuracy_m && <span>±{Math.round(e.accuracy_m)}m</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stat cards — yellow + burgundy only */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Streak" value={stats ? `${stats.streak}` : "—"} sub="consecutive days" icon={<Flame className="h-4 w-4" />} chip="bg-[#fdf3d4] text-[#b8860b]" />
        <StatCard label="Present" value={stats ? `${stats.presentThisMonth}` : "—"} sub="days this month" icon={<CalendarCheck className="h-4 w-4" />} chip="bg-[#f6e6ee] text-[#8c2f52]" />
        <StatCard label="Late Remarks" value={stats ? `${stats.lateThisMonth}` : "—"} sub="after 9:30 AM" icon={<AlarmClock className="h-4 w-4" />} chip="bg-[#fdf3d4] text-[#b8860b]" />
        <StatCard label="Today" value={workingMins > 0 ? `${workHrs}h ${workMin}m` : "0h 0m"} sub="hours logged" icon={<Timer className="h-4 w-4" />} chip="bg-[#f6e6ee] text-[#8c2f52]" />
      </div>

      {/* Quick links — icon tiles */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Quick Links</h3>
        <div className="grid grid-cols-4 gap-2">
          <QuickLink to="/leaves" search={{ tab: "apply" }} emoji="🌂" label="Apply Leave" />
          <QuickLink to="/leaves" search={{ tab: "balances" }} emoji="📊" label="Balances" />
          <QuickLink to="/history" emoji="📋" label="Logs" />
          <QuickLink to="/settings" emoji="⚙️" label="Settings" />
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, search, emoji, label }: { to: string; search?: Record<string, string>; emoji: string; label: string }) {
  return (
    <Link
      to={to as "/leaves" | "/history" | "/settings"}
      search={search as any}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-white px-2 py-3 text-center transition-colors hover:bg-[#fdf3d4]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#fdf3d4] text-lg">{emoji}</span>
      <span className="text-[11px] font-medium text-foreground leading-tight">{label}</span>
    </Link>
  );
}

function StatCard({ label, value, sub, icon, chip }: {
  label: string; value: string; sub: string; icon: React.ReactNode; chip: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chip}`}>{icon}</div>
        <div className="text-xs font-medium text-muted-foreground leading-tight">{label}</div>
      </div>
      <div className="mt-2.5 text-2xl font-bold text-[#8c2f52]">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function Check({ icon, label, value, ok, warn }: {
  icon: React.ReactNode; label: string; value: string; ok: boolean; warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${warn ? "bg-red-50 text-red-500" : ok ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium ${warn ? "text-red-600" : ok ? "text-green-700" : "text-muted-foreground"}`}>{value}</div>
      </div>
      {warn ? <XCircle className="h-4 w-4 shrink-0 text-red-500" /> : ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" /> : null}
    </div>
  );
}

const WEEK_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const WEEK_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const SCHED_PASTEL: Record<string, { bg: string; text: string; dot: string }> = {
  WFO:  { bg: "bg-white border border-border",          text: "text-[#8c2f52]", dot: "bg-[#8c2f52]" },
  WFH:  { bg: "bg-[#fdf3d4] border border-[#f0e2bd]",   text: "text-[#9a7416]", dot: "bg-[#d99b25]" },
  OFF:  { bg: "bg-gray-50 border border-gray-100",      text: "text-gray-400",  dot: "bg-gray-300" },
  FLEX: { bg: "bg-[#f6e6ee] border border-[#ecccda]",   text: "text-[#b8456e]", dot: "bg-[#b8456e]" },
};

function ThisWeek({ empConfig, todayEvents }: { empConfig: EmployeeConfig | null; todayEvents: AttendanceEvent[] }) {
  const todayIdx = new Date().getDay(); // 0=Sun
  const jsToGrid = (d: number) => (d === 0 ? 6 : d - 1);
  const todayGrid = jsToGrid(todayIdx);

  return (
    <div className="rounded-2xl bg-white border border-border shadow-sm p-4">
      <h3 className="font-semibold text-sm mb-3">This Week</h3>
      <div className="grid grid-cols-7 gap-1">
        {WEEK_DAY_KEYS.map((key, i) => {
          const sched = (empConfig?.weekly_schedule[key] as string) ?? "WFO";
          const style = SCHED_PASTEL[sched] ?? SCHED_PASTEL.OFF;
          const isToday = i === todayGrid;
          const isPast = i < todayGrid;
          const hasPunch = isToday && todayEvents.length > 0;
          return (
            <div key={key} className={`flex flex-col items-center gap-1 rounded-xl py-2.5 transition-colors ${style.bg}
              ${isToday ? "ring-2 ring-[#8c2f52]/40 shadow-sm" : ""} ${isPast ? "opacity-70" : ""}`}>
              <div className={`text-[10px] font-bold uppercase ${style.text}`}>
                {WEEK_DAY_LABELS[i].slice(0, 1)}
              </div>
              <div className={`h-2 w-2 rounded-full ${hasPunch ? "bg-green-600" : style.dot}`} />
              <div className={`text-[9px] font-semibold uppercase ${style.text}`}>
                {sched === "OFF" ? "—" : sched}
              </div>
              {isToday && <div className="text-[8px] font-bold text-[#8c2f52]">Today</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {[
          { dot: "bg-green-600", label: "Punched" },
          { dot: "bg-[#8c2f52]", label: "WFO" },
          { dot: "bg-[#d99b25]", label: "WFH" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
