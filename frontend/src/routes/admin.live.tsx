import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getDailyStatusFn, getAttendanceTrendFn } from "@/backend/server-fns";
import type { EmployeeDayStatus, TrendPoint } from "@/backend/server-fns";
import { ExternalLink, RefreshCw, TrendingUp, AlertTriangle, Flag, Building2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

export const Route = createFileRoute("/admin/live")({
  head: () => ({ meta: [{ title: "HR Dashboard · J2W" }] }),
  component: AdminLive,
});

function AdminLive() {
  const [rows, setRows] = useState<EmployeeDayStatus[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [spinning, setSpinning] = useState(false);

  function load() {
    setSpinning(true);
    Promise.all([getDailyStatusFn(), getAttendanceTrendFn(10)]).then(([r, t]) => {
      setRows(r);
      setTrend(t);
      setLastRefresh(new Date());
      setTimeout(() => setSpinning(false), 600);
    });
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const working = rows.filter((r) => r.status !== "non_working");
  const present = rows.filter((r) => r.status === "present");
  const clockedOut = rows.filter((r) => r.status === "clocked_out");
  const onLeave = rows.filter((r) => r.status === "on_leave");
  const absent = rows.filter((r) => r.status === "absent");
  const flagged = rows.filter((r) => r.anomalies.length > 0);
  const attendancePct = working.length > 0 ? Math.round(((present.length + clockedOut.length) / working.length) * 100) : 0;

  // Group by client company for the breakdown cards
  const byCompany = Object.values(
    rows.reduce<Record<string, { name: string; total: number; present: number; leave: number; absent: number }>>((acc, r) => {
      const key = r.client_company || "—";
      acc[key] ??= { name: key, total: 0, present: 0, leave: 0, absent: 0 };
      acc[key].total++;
      if (r.status === "present" || r.status === "clocked_out") acc[key].present++;
      else if (r.status === "on_leave") acc[key].leave++;
      else if (r.status === "absent") acc[key].absent++;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  const trendTotals = trend.reduce((s, d) => ({ on_time: s.on_time + d.on_time, late: s.late + d.late }), { on_time: 0, late: 0 });

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5">
      {/* Hero banner */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #6e2440 0%, #8c2f52 55%, #b8456e 100%)" }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #f4c84c, transparent 70%)" }} />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #f6d27e, transparent 70%)" }} />
        </div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="text-xs text-white/50 uppercase tracking-wider mb-1">HR Dashboard · Live</div>
            <div className="text-2xl font-bold text-white">{dateStr}</div>
            <div className="text-sm text-white/50 mt-0.5">
              Last updated {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-mono font-bold text-white">{timeStr}</div>
              <div className="text-xs text-white/40 mt-0.5">IST</div>
            </div>
            <button onClick={load}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 transition-colors">
              <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Stat pills inside banner */}
        <div className="relative z-10 grid grid-cols-2 gap-px sm:grid-cols-4 border-t border-white/10">
          {[
            { label: "Attendance", value: `${attendancePct}%`, sub: "of workforce", color: "text-green-300" },
            { label: "Currently In", value: present.length, sub: "punched in", color: "text-emerald-300" },
            { label: "On Leave", value: onLeave.length, sub: "approved", color: "text-amber-300" },
            { label: "Absent", value: absent.length, sub: "unaccounted", color: absent.length > 0 ? "text-red-300" : "text-white/40" },
          ].map((s) => (
            <div key={s.label} className="px-5 py-4 bg-white/5 first:rounded-bl-2xl last:rounded-br-2xl">
              <div className="text-[10px] text-white/40 uppercase tracking-wider">{s.label}</div>
              <div className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-white/30">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart + company breakdown */}
      <div className="grid gap-5 lg:grid-cols-[1fr,320px]">
        {/* Attendance trend chart */}
        <div className="rounded-2xl bg-white border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Attendance Status — last 10 days
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">First punch-in per employee, classified by shift start</p>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#8c2f52" }} /> On-time {trendTotals.on_time}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#f4c84c" }} /> Late {trendTotals.late}</span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "rgba(140,47,82,0.06)" }} contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="on_time" name="On-time" fill="#8c2f52" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="late" name="Late" fill="#f4c84c" radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Company / department breakdown */}
        <div className="rounded-2xl bg-white border border-border shadow-sm p-5">
          <h2 className="font-bold text-base flex items-center gap-2 mb-4">
            <Building2 className="h-4 w-4 text-primary" /> By Company
          </h2>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {byCompany.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
            {byCompany.map((c) => (
              <div key={c.name} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold truncate">{c.name}</span>
                  <span className="text-xs font-bold text-foreground">{c.total}</span>
                </div>
                <div className="mt-2 flex gap-3 text-[11px]">
                  <span className="text-green-600 font-semibold">{c.present} present</span>
                  <span className="text-amber-600 font-semibold">{c.leave} leave</span>
                  <span className={c.absent > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>{c.absent} absent</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Flagged punches panel */}
      {flagged.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3 border-b border-amber-200">
            <Flag className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="font-semibold text-sm text-amber-900">
              {flagged.length} flagged employee{flagged.length > 1 ? "s" : ""} today — requires HR review
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {flagged.map((r) => (
              <div key={r.user_id} className="flex items-start gap-3 px-5 py-3">
                <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white mt-0.5"
                  style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
                  {r.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-amber-900">{r.full_name}</span>
                    <span className="text-xs text-amber-600">{r.email}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {r.anomalies.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        ⚠ {FLAG_LABELS[a] ?? a.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
                <Link to="/admin/attendance/$userId" params={{ userId: r.user_id }}
                  className="shrink-0 text-xs text-amber-700 hover:underline flex items-center gap-1 mt-0.5">
                  Review <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Employee status panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatusPanel title="Currently In" color="border-l-4 border-l-green-500" count={present.length} accentBg="bg-green-500">
          {present.length === 0
            ? <EmptyState text="No one is punched in right now." />
            : present.map((r) => <EmpCard key={r.user_id} r={r} detail={`In since ${r.first_in ? fmt(r.first_in) : "—"}`} detailColor="text-green-700" pulse />)
          }
        </StatusPanel>

        <StatusPanel title="Clocked Out" color="border-l-4 border-l-blue-500" count={clockedOut.length} accentBg="bg-blue-500">
          {clockedOut.length === 0
            ? <EmptyState text="No one has clocked out yet." />
            : clockedOut.map((r) => <EmpCard key={r.user_id} r={r}
                detail={`${r.first_in ? fmt(r.first_in) : "—"} → ${r.last_out ? fmt(r.last_out) : "—"} · ${minsToHM(r.work_minutes)}`}
                detailColor="text-blue-700" />)
          }
        </StatusPanel>

        <StatusPanel title="On Leave" color="border-l-4 border-l-amber-400" count={onLeave.length} accentBg="bg-amber-400">
          {onLeave.length === 0
            ? <EmptyState text="No approved leaves today." />
            : onLeave.map((r) => <EmpCard key={r.user_id} r={r} detail={r.on_leave_type ?? "Leave"} detailColor="text-amber-700" badge />)
          }
        </StatusPanel>

        <StatusPanel title="Absent" color="border-l-4 border-l-red-400" count={absent.length} accentBg="bg-red-400">
          {absent.length === 0
            ? <EmptyState text="No unaccounted absences." icon="✅" />
            : absent.map((r) => <EmpCard key={r.user_id} r={r} detail="Not punched in" detailColor="text-red-600" />)
          }
        </StatusPanel>
      </div>

      {/* All employees table */}
      <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-sm">All Employees — Today</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{working.length} working today</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            {attendancePct}% attendance
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {["Employee", "Client", "Status", "First In", "Last Out", "Hours", "Flags", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.filter((r) => r.status !== "non_working").map((r) => (
                <tr key={r.user_id} className={`transition-colors ${r.anomalies.length > 0 ? "bg-amber-50/50" : "hover:bg-muted/20"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                        {r.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <div className="font-medium">{r.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.client_company}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} leaveType={r.on_leave_type} /></td>
                  <td className="px-4 py-3 text-xs font-mono">{r.first_in ? fmt(r.first_in) : <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-4 py-3 text-xs font-mono">{r.last_out ? fmt(r.last_out) : <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-4 py-3 text-sm font-semibold">{r.work_minutes > 0 ? minsToHM(r.work_minutes) : <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-4 py-3">
                    {r.anomalies.length > 0
                      ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">⚠ {r.anomalies.length}</span>
                      : <span className="text-muted-foreground/30 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/admin/attendance/$userId" params={{ userId: r.user_id }}
                      className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
                      Details <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Flag label map ────────────────────────────────────────────────────────────
const FLAG_LABELS: Record<string, string> = {
  geofence_outside_on_wfo:  "Outside office zone (WFO)",
  geofence_outside_on_wfh:  "Outside home zone (WFH)",
  geofence_outside_on_flex: "Outside all zones (FLEX)",
  wfh_outside_city_range:   "WFH >100km from office",
  low_gps_accuracy:         "Low GPS accuracy",
  mock_location_suspected:  "Mock/fake location",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusPanel({ title, color, count, accentBg, children }: {
  title: string; color: string; count: number; accentBg: string; children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl bg-white border border-border shadow-sm overflow-hidden ${color}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className={`flex h-6 min-w-6 items-center justify-center rounded-full text-[11px] font-bold text-white px-2 ${accentBg}`}>{count}</span>
      </div>
      <div className="divide-y divide-border max-h-64 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmpCard({ r, detail, detailColor, pulse, badge }: {
  r: EmployeeDayStatus; detail: string; detailColor: string; pulse?: boolean; badge?: boolean;
}) {
  const hasFlag = r.anomalies.length > 0;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${hasFlag ? "bg-amber-50/60" : ""}`}>
      <div className="relative">
        <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: hasFlag ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
          {r.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
        {pulse && !hasFlag && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 animate-pulse" />}
        {hasFlag && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-500" title="Flagged" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{r.full_name}</span>
          {hasFlag && <span className="shrink-0 text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">⚠ {r.anomalies.length}</span>}
        </div>
        <div className={`text-xs truncate ${detailColor} ${badge ? "rounded-full bg-amber-100 px-2 py-0.5 inline-block font-semibold" : ""}`}>
          {detail}
        </div>
        {hasFlag && (
          <div className="mt-0.5 text-[10px] text-amber-700 truncate">
            {r.anomalies.map((a) => FLAG_LABELS[a] ?? a.replace(/_/g, " ")).join(" · ")}
          </div>
        )}
      </div>
      <Link to="/admin/attendance/$userId" params={{ userId: r.user_id }}
        className="text-muted-foreground/30 hover:text-primary transition-colors shrink-0">
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function EmptyState({ text, icon = "😴" }: { text: string; icon?: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-muted-foreground">{text}</div>
    </div>
  );
}

function StatusPill({ status, leaveType }: { status: EmployeeDayStatus["status"]; leaveType: string | null }) {
  if (status === "present") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />Present
    </span>
  );
  if (status === "clocked_out") return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">Clocked Out</span>;
  if (status === "on_leave") return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{leaveType ?? "Leave"}</span>;
  if (status === "absent") return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">Absent</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Off</span>;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function minsToHM(mins: number) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
