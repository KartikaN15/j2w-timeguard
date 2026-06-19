import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getDeviceFingerprint } from "@/lib/fingerprint";
import { getDeviceStatusFn, getEmployeeConfigFn } from "@/backend/server-fns";
import type { EmployeeConfig } from "@/backend/server-fns";
import {
  Smartphone, Navigation, Building2, CheckCircle2, XCircle,
  Loader2, Clock, Settings as SettingsIcon, MapPin,
  ShieldCheck, Info, Mail, Phone, LogOut,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · J2W Attendance" }] }),
  component: SettingsPage,
});

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SCHEDULE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  WFO:  { bg: "bg-blue-50   border-blue-100",   text: "text-blue-700",   dot: "bg-blue-400" },
  WFH:  { bg: "bg-green-50  border-green-100",  text: "text-green-700",  dot: "bg-green-400" },
  OFF:  { bg: "bg-gray-50   border-gray-100",   text: "text-gray-400",   dot: "bg-gray-300" },
  FLEX: { bg: "bg-purple-50 border-purple-100", text: "text-purple-700", dot: "bg-purple-400" },
};

type PermState = "unknown" | "granted" | "denied" | "prompt";

function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [deviceKind, setDeviceKind] = useState<"loading" | "approved" | "pending" | "unregistered">("loading");
  const [perm, setPerm] = useState<PermState>("unknown");
  const [empConfig, setEmpConfig] = useState<EmployeeConfig | null>(null);
  const [scheduleType, setScheduleType] = useState("WFO");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const fp = await getDeviceFingerprint();
      const status = await getDeviceStatusFn({ data: { fingerprint: fp } });
      setDeviceKind(status.kind);
      const cfg = await getEmployeeConfigFn();
      if (cfg) {
        setEmpConfig(cfg);
        const dayKey = DAY_KEYS[new Date().getDay()];
        setScheduleType((cfg.weekly_schedule[dayKey] as string) ?? "WFO");
      }
    })();
  }, [user]);

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

  if (loading || !user) return (
    <div className="grid place-items-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <SettingsIcon className="h-5 w-5 text-muted-foreground" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Device status, schedule and attendance policy</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr,320px]">
        {/* ── Left column ── */}
        <div className="space-y-5">
          {/* System Status */}
          <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">System Status</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Pre-flight checks for attendance punch</p>
            </div>
            <div className="p-5 space-y-3">
              <StatusRow
                icon={<Smartphone className="h-4 w-4" />}
                label="Device"
                sublabel="This browser / device"
                value={deviceKind === "loading" ? "Checking…" : deviceKind === "approved" ? "Approved" : "Pending approval"}
                ok={deviceKind === "approved"}
                warn={deviceKind !== "approved" && deviceKind !== "loading"}
              />
              <StatusRow
                icon={<Navigation className="h-4 w-4" />}
                label="GPS / Location"
                sublabel="Browser permission"
                value={perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked — re-enable in browser settings" : "Will prompt on punch"}
                ok={perm === "granted" || perm === "prompt"}
                warn={perm === "denied"}
              />
              <StatusRow
                icon={<Clock className="h-4 w-4" />}
                label="Today's Schedule"
                sublabel={DAY_LABELS[new Date().getDay()]}
                value={scheduleType}
                ok={scheduleType !== "OFF"}
                warn={scheduleType === "OFF"}
              />
              <StatusRow
                icon={<Building2 className="h-4 w-4" />}
                label="Office Geofence"
                sublabel="For WFO days · set by HR Admin"
                value="Set by HR via Admin → Employees. Until set, WFO punches are flagged but allowed."
                ok={false}
              />
            </div>
          </div>

          {/* Weekly Schedule */}
          {empConfig && (
            <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-sm">Weekly Schedule</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Assigned by HR — contact HR Admin to update</p>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-7 gap-2">
                  {DAY_KEYS.map((d, i) => {
                    const s = (empConfig.weekly_schedule[d] as string) ?? "OFF";
                    const styles = SCHEDULE_STYLES[s] ?? SCHEDULE_STYLES.OFF;
                    const isToday = new Date().getDay() === i;
                    return (
                      <div key={d} className={`rounded-xl border p-2.5 text-center ${styles.bg} ${isToday ? "ring-2 ring-primary ring-offset-1 shadow-sm" : ""}`}>
                        <div className={`text-[9px] font-bold uppercase tracking-wider ${styles.text} opacity-70`}>{DAY_LABELS[i]}</div>
                        <div className={`mx-auto mt-1.5 h-2 w-2 rounded-full ${styles.dot}`} />
                        <div className={`mt-1 text-[9px] font-bold ${styles.text}`}>{s === "OFF" ? "—" : s}</div>
                        {isToday && <div className={`mt-0.5 text-[8px] font-semibold ${styles.text} opacity-60`}>Today</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          {/* Geofence Rules */}
          <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Attendance Rules</h3>
            </div>
            <div className="p-4 space-y-3">
              <RuleCard
                icon={<Building2 className="h-3.5 w-3.5" />}
                color="bg-blue-50 border-blue-100 text-blue-700"
                dotColor="bg-blue-400"
                title="WFO Days"
                rule="Must punch from within 1km of your assigned office. Punch outside this zone is flagged for HR review."
              />
              <RuleCard
                icon={<MapPin className="h-3.5 w-3.5" />}
                color="bg-green-50 border-green-100 text-green-700"
                dotColor="bg-green-400"
                title="WFH Days"
                rule="Punch from anywhere within 50km of your office. Beyond 50km is flagged for HR review."
              />
              <RuleCard
                icon={<Clock className="h-3.5 w-3.5" />}
                color="bg-amber-50 border-amber-100 text-amber-700"
                dotColor="bg-amber-400"
                title="Late Remark"
                rule="Punch-in after 9:30 AM is marked late. More than 2 late remarks/month triggers an alert."
              />
              <RuleCard
                icon={<Info className="h-3.5 w-3.5" />}
                color="bg-purple-50 border-purple-100 text-purple-700"
                dotColor="bg-purple-400"
                title="FLEX Days"
                rule="Punch from within the office zone. Location outside is flagged but not blocked."
              />
            </div>
          </div>

          {/* Contact HR */}
          <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Contact HR</h3>
              <p className="text-xs text-muted-foreground mt-0.5">For schedule changes or device issues</p>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600">
                  <Mail className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">HRBP</div>
                  <div className="text-xs font-medium">hrbp@joulestowatts.com</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Phone className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Shift Hours</div>
                  <div className="text-xs font-medium">9:30 AM – 6:30 PM IST</div>
                </div>
              </div>
              <div className="mt-1 rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                Raise a request via email for schedule changes, device approvals, or leave policy queries.
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Account</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Signed in as {user.user_metadata.full_name}</p>
            </div>
            <div className="p-4">
              <button onClick={() => signOut()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>

          {/* App info */}
          <div className="rounded-2xl border border-border bg-white shadow-sm p-4">
            <div className="text-[10px] text-muted-foreground/60 text-center space-y-0.5">
              <div className="font-semibold text-muted-foreground">J2W eAttendance</div>
              <div>GPS-verified attendance · Demo mode</div>
              <div>© 2026 Joules to Watts Business Solutions</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ icon, label, sublabel, value, ok, warn }: {
  icon: React.ReactNode; label: string; sublabel: string; value: string; ok: boolean; warn?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-border last:border-0">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
        ${warn ? "bg-red-50 text-red-500" : ok ? "bg-green-50 text-green-600" : "bg-muted text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">· {sublabel}</span>
        </div>
        <div className={`text-sm mt-0.5 ${warn ? "text-red-600" : ok ? "text-green-700 font-medium" : "text-muted-foreground"}`}>{value}</div>
      </div>
      <div className="shrink-0">
        {warn ? <XCircle className="h-5 w-5 text-red-400" /> : ok ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : null}
      </div>
    </div>
  );
}

function RuleCard({ icon, color, dotColor, title, rule }: {
  icon: React.ReactNode; color: string; dotColor: string; title: string; rule: string;
}) {
  return (
    <div className={`rounded-xl border p-3 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-xs font-bold">{title}</span>
        <span className="ml-auto opacity-60">{icon}</span>
      </div>
      <p className="text-[11px] opacity-80 leading-relaxed">{rule}</p>
    </div>
  );
}
