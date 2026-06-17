import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import {
  submitPunchFn, getTodayEventsFn, getAttendanceStatsFn,
  getDeviceStatusFn, getEmployeeConfigFn,
} from "@/backend/server-fns";
import type { AttendanceStats } from "@/backend/punch.api";
import type { EmployeeConfig } from "@/backend/mock-db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MapPin, Smartphone, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Clock, Building2, Home, Navigation,
  LogIn, LogOut, Wifi, WifiOff,
} from "lucide-react";
import type { AttendanceEvent } from "@/backend/mock-db";

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

const SCHEDULE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  WFO: { label: "Work from Office", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <Building2 className="h-3.5 w-3.5" /> },
  WFH: { label: "Work from Home", color: "bg-green-100 text-green-700 border-green-200", icon: <Home className="h-3.5 w-3.5" /> },
  OFF: { label: "Non-working Day", color: "bg-gray-100 text-gray-500 border-gray-200", icon: <XCircle className="h-3.5 w-3.5" /> },
  FLEX: { label: "Flexible", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <Clock className="h-3.5 w-3.5" /> },
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
      const status = await getDeviceStatusFn({ data: { userId: user.id, fingerprint: fp } });
      setDeviceKind(status.kind);

      const [events, cfg, s] = await Promise.all([
        getTodayEventsFn({ data: user.id }),
        getEmployeeConfigFn({ data: user.id }),
        getAttendanceStatsFn({ data: user.id }),
      ]);
      setStats(s);
      if (cfg) setEmpConfig(cfg);
      setTodayEvents(events);
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
    // Client-side geofence preview against saved config
    let geofenceLabel = "Geofence not configured";
    let geofenceColor = "text-amber-600";
    if (empConfig) {
      const officeOk = empConfig.office_lat != null && haversineM(lat, lng, empConfig.office_lat, empConfig.office_lng!) <= empConfig.office_radius_m;
      const homeOk = empConfig.home_lat != null && haversineM(lat, lng, empConfig.home_lat, empConfig.home_lng!) <= empConfig.home_radius_m;
      if (officeOk) { geofenceLabel = `Inside office zone (≤${empConfig.office_radius_m}m)`; geofenceColor = "text-blue-600"; }
      else if (homeOk) { geofenceLabel = `Inside home zone (≤${empConfig.home_radius_m}m)`; geofenceColor = "text-green-600"; }
      else if (empConfig.office_lat != null || empConfig.home_lat != null) {
        const distO = empConfig.office_lat != null ? Math.round(haversineM(lat, lng, empConfig.office_lat, empConfig.office_lng!)) : null;
        const distH = empConfig.home_lat != null ? Math.round(haversineM(lat, lng, empConfig.home_lat, empConfig.home_lng!)) : null;
        const parts = [distO != null ? `${distO}m from office` : null, distH != null ? `${distH}m from home` : null].filter(Boolean);
        geofenceLabel = `Outside zones — ${parts.join(", ")}`;
        geofenceColor = "text-red-600";
      }
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
        user_id: user.id,
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
        getAttendanceStatsFn({ data: user.id }).then(setStats);
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

  return (
    <div className="space-y-4">
      {/* Date + schedule badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h1>
          <p className="text-sm text-muted-foreground">{user.user_metadata.full_name}</p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${scheduleMeta.color}`}>
          {scheduleMeta.icon}
          {scheduleMeta.label}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Streak" value={stats ? `${stats.streak}` : "—"} sub="consecutive days" icon="🔥" color="text-orange-600" bg="bg-orange-50 border-orange-100" />
        <StatCard label="Present" value={stats ? `${stats.presentThisMonth}` : "—"} sub="days this month" icon="✅" color="text-green-600" bg="bg-green-50 border-green-100" />
        <StatCard label="Late Remarks" value={stats ? `${stats.lateThisMonth}` : "—"} sub="after 9:30 AM" icon="⏰"
          color={stats && stats.lateThisMonth > 2 ? "text-red-600" : "text-amber-600"}
          bg={stats && stats.lateThisMonth > 2 ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"} />
        <StatCard label="Today" value={workingMins > 0 ? `${workHrs}h ${workMin}m` : "0h 0m"} sub="hours logged" icon="🕐" color="text-blue-600" bg="bg-blue-50 border-blue-100" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr,300px]">
        {/* ── Main punch card ── */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white shadow-sm border border-border overflow-hidden">
            {/* Gradient clock header */}
            <div className="bg-brand px-5 py-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl sm:text-4xl font-mono font-bold tracking-tight tabular-nums">
                    {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${isPunchedIn ? "bg-green-500/30 text-green-100" : "bg-white/15 text-white/60"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isPunchedIn ? "bg-green-300 animate-pulse" : "bg-white/40"}`} />
                      {isPunchedIn ? `In since ${new Date(lastIn!.ts_utc).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "Not punched in"}
                    </span>
                    {workingMins > 0 && <span className="text-xs text-white/60">⏱ {workHrs}h {workMin}m</span>}
                  </div>
                </div>
                <div className="text-right text-white/50 text-xs hidden sm:block">
                  {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""} today
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              {/* Warnings */}
              {scheduleType === "OFF" && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Non-working day — punch disabled.</div>
              )}

              {scheduleType === "WFH" && (
                <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <Home className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  WFH day — punch is valid within 100km of office. Location will be verified on punch.
                </div>
              )}

              {/* Punch buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled={busy || scheduleType === "OFF"}
                  onClick={() => doPunch("punch_in")}
                  className="group flex flex-col items-center justify-center rounded-2xl border-2 border-green-200 bg-green-50 py-7 transition-all hover:border-green-400 hover:bg-green-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="h-7 w-7 animate-spin text-green-600" /> : <LogIn className="h-7 w-7 text-green-600 group-hover:scale-110 transition-transform" />}
                  <span className="mt-2 text-sm font-bold text-green-700">Punch In</span>
                  {lastIn && !isPunchedIn && <span className="mt-0.5 text-[10px] text-green-600/60">Last: {new Date(lastIn.ts_utc).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
                </button>
                <button
                  disabled={busy || !isPunchedIn || scheduleType === "OFF"}
                  onClick={() => doPunch("punch_out")}
                  className="group flex flex-col items-center justify-center rounded-2xl border-2 border-red-200 bg-red-50 py-7 transition-all hover:border-red-400 hover:bg-red-100 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="h-7 w-7 animate-spin text-red-500" /> : <LogOut className="h-7 w-7 text-red-500 group-hover:scale-110 transition-transform" />}
                  <span className="mt-2 text-sm font-bold text-red-600">Punch Out</span>
                  {lastOut && <span className="mt-0.5 text-[10px] text-red-500/60">Last: {new Date(lastOut.ts_utc).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
                </button>
              </div>

              {busy && statusLine && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{statusLine}
                </div>
              )}

              {lastPunch && (
                <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
                  <div>
                    <div className="font-semibold text-green-800 text-sm">{lastPunch.type === "punch_in" ? "Punched In" : "Punched Out"} at {lastPunch.time}</div>
                    <div className="text-xs text-green-700 capitalize">{lastPunch.geo.replace(/_/g, " ")}</div>
                  </div>
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
          </div>

          {/* Today's timeline */}
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
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-4">
          {/* Location preview */}
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
                <div className="rounded-xl bg-[#f0f4f8] p-3">
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
              <div className="flex flex-col items-center gap-2 rounded-xl bg-[#f0f4f8] py-5 text-center">
                <MapPin className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Click Refresh to see your GPS</p>
              </div>
            )}
          </div>

          {/* This week */}
          <ThisWeek empConfig={empConfig} todayEvents={todayEvents} />

          {/* Quick links */}
          <div className="rounded-2xl bg-white border border-border shadow-sm p-4">
            <h3 className="font-semibold text-sm mb-3">Quick Links</h3>
            <div className="space-y-1.5">
              <Link to="/leaves" search={{ tab: "apply" }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                <span className="text-base">🌂</span>Apply Leave
              </Link>
              <Link to="/leaves" search={{ tab: "balances" }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                <span className="text-base">📊</span>Leave Balances
              </Link>
              <Link to="/history"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                <span className="text-base">📋</span>Attendance Logs
              </Link>
              <Link to="/settings"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                <span className="text-base">⚙️</span>Settings & Setup
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, color, bg }: {
  label: string; value: string; sub: string; icon: string; color: string; bg: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-muted-foreground leading-tight">{label}</div>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
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

const SCHED_PASTEL: Record<string, { bg: string; text: string; dot: string; ring: string }> = {
  WFO:  { bg: "bg-blue-50 border border-blue-100",     text: "text-blue-700",   dot: "bg-blue-400",   ring: "ring-blue-300" },
  WFH:  { bg: "bg-green-50 border border-green-100",   text: "text-green-700",  dot: "bg-green-400",  ring: "ring-green-300" },
  OFF:  { bg: "bg-gray-50 border border-gray-100",     text: "text-gray-400",   dot: "bg-gray-200",   ring: "ring-gray-200" },
  FLEX: { bg: "bg-purple-50 border border-purple-100", text: "text-purple-700", dot: "bg-purple-400", ring: "ring-purple-300" },
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
              ${isToday ? `ring-2 ${style.ring} shadow-sm` : ""} ${isPast ? "opacity-60" : ""}`}>
              <div className={`text-[9px] font-bold uppercase ${style.text}`}>
                {WEEK_DAY_LABELS[i].slice(0, 1)}
              </div>
              <div className={`h-2 w-2 rounded-full ${hasPunch ? "bg-green-500" : style.dot}`} />
              <div className={`text-[8px] font-bold uppercase ${style.text}`}>
                {sched === "OFF" ? "—" : sched}
              </div>
              {isToday && <div className={`text-[7px] font-bold ${style.text} opacity-70`}>Today</div>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {[
          { dot: "bg-green-500", label: "Punched" },
          { dot: "bg-blue-400", label: "WFO" },
          { dot: "bg-green-400", label: "WFH" },
          { dot: "bg-purple-400", label: "FLEX" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className={`h-1.5 w-1.5 rounded-full ${l.dot}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
