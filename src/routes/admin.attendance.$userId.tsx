import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getMonthAttendanceFn, getEmployeeConfigFn } from "@/backend/server-fns";
import type { DayRecord } from "@/backend/punch.api";
import { getUserById } from "@/backend/auth.api";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin/attendance/$userId")({
  head: () => ({ meta: [{ title: "Attendance · J2W" }] }),
  component: AttendanceCalendar,
});

function AttendanceCalendar() {
  const { userId } = Route.useParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [selected, setSelected] = useState<DayRecord | null>(null);
  const [empName, setEmpName] = useState("");
  const [shiftStart, setShiftStart] = useState("09:30");
  const [shiftEnd, setShiftEnd] = useState("18:30");
  const [stdHours, setStdHours] = useState(9);

  useEffect(() => {
    const u = getUserById(userId);
    setEmpName(u?.user_metadata.full_name ?? userId);
  }, [userId]);

  useEffect(() => {
    getMonthAttendanceFn({ data: { userId, year, month } }).then(setRecords);
  }, [userId, year, month]);

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function nextMonth() {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    if (new Date(ny, nm - 1, 1) > new Date()) return;
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  }

  const presentDays = records.filter(r => r.status === "present" || r.status === "clocked_out").length;
  const absentDays = records.filter(r => r.status === "absent").length;
  const leaveDays = records.filter(r => r.status === "on_leave").length;
  const lateDays = records.filter(r => r.is_late).length;
  const totalWorkMins = records.reduce((s, r) => s + r.work_minutes, 0);
  const avgWorkMins = presentDays > 0 ? Math.round(totalWorkMins / presentDays) : 0;
  const stdMins = stdHours * 60;

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (DayRecord | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = String(i + 1).padStart(2, "0");
      const key = `${year}-${String(month).padStart(2, "0")}-${d}`;
      return records.find(r => r.date === key) ?? null;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link to="/admin/live" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium">{empName}</span>
      </div>

      {/* Summary stats — greytHR style */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Avg Work Hrs" value={minsToHM(avgWorkMins)} sub="per present day" />
        <SummaryCard label="Present Days" value={String(presentDays)} sub="this month" color="text-green-600" />
        <SummaryCard label="Absent Days" value={String(absentDays)} sub="this month" color={absentDays > 0 ? "text-red-600" : undefined} />
        <SummaryCard label="Leave Days" value={String(leaveDays)} sub="approved" color="text-amber-600" />
        <SummaryCard label="Late Arrivals" value={String(lateDays)} sub={`after ${shiftStart}`} color={lateDays > 0 ? "text-red-600" : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr,340px]">
        {/* Calendar */}
        <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
            <button onClick={prevMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="font-bold text-base">{monthName}</h2>
            <button onClick={nextMonth} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 px-5 py-3 border-b border-border text-[11px]">
            {[
              { color: "bg-green-500", label: "P – Present" },
              { color: "bg-blue-500", label: "CO – Clocked Out" },
              { color: "bg-amber-400", label: "L – On Leave" },
              { color: "bg-red-400", label: "A – Absent" },
              { color: "bg-gray-300", label: "R – Non-working" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-muted-foreground">
                <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}
              </span>
            ))}
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((rec, i) => {
              const dayNum = i - firstDay + 1;
              const isSelected = selected?.date === rec?.date;
              const isToday = rec?.date === new Date().toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  onClick={() => rec && setSelected(isSelected ? null : rec)}
                  className={`relative min-h-[72px] border-b border-r border-border p-1.5 transition-colors
                    ${rec ? "cursor-pointer hover:bg-muted/30" : "bg-muted/10"}
                    ${isSelected ? "bg-primary/5 ring-2 ring-inset ring-primary/40" : ""}
                    ${!rec || dayNum < 1 || dayNum > daysInMonth ? "opacity-30" : ""}
                  `}
                >
                  {rec && (
                    <>
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold
                        ${isToday ? "bg-primary text-white" : "text-foreground"}`}>
                        {dayNum}
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5">
                        <DayTag rec={rec} />
                        <div className="text-[9px] text-muted-foreground font-mono">
                          {rec.schedule_type !== "OFF" ? rec.schedule_type : ""}
                        </div>
                        {rec.is_late && <span className="text-[9px] text-amber-600 font-semibold">LATE</span>}
                        {rec.work_minutes > 0 && (
                          <div className="text-[9px] text-muted-foreground">{minsToHM(rec.work_minutes)}</div>
                        )}
                      </div>
                    </>
                  )}
                  {(!rec || dayNum < 1) && dayNum >= 1 && dayNum <= daysInMonth && (
                    <div className="text-xs text-muted-foreground/40">{dayNum}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel — greytHR right panel */}
        <div className="space-y-4">
          {selected ? (
            <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
              {/* Date header */}
              <div className="bg-brand px-5 py-4 text-white">
                <div className="text-2xl font-bold">
                  {new Date(selected.date + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
                <div className="text-sm text-white/70">
                  {new Date(selected.date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long" })}
                  {" · "}{selected.schedule_type}
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Shift info */}
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Shift Details</div>
                  <div className="rounded-lg bg-muted/30 p-3 text-sm grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Shift</div>
                      <div className="font-semibold">General (GS)</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Timing</div>
                      <div className="font-semibold">{shiftStart} – {shiftEnd}</div>
                    </div>
                  </div>
                </div>

                {/* Attendance metrics */}
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Attendance</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="First In" value={selected.first_in ? fmtFull(selected.first_in) : "—"} highlight={selected.is_late} />
                    <Metric label="Last Out" value={selected.last_out ? fmtFull(selected.last_out) : selected.status === "present" ? "Still In" : "—"} />
                    <Metric label="Total Work Hrs" value={minsToHM(selected.work_minutes)} />
                    <Metric label="Shortfall" value={selected.work_minutes > 0 ? (stdMins > selected.work_minutes ? minsToHM(stdMins - selected.work_minutes) : "0h 0m") : "—"} highlight={stdMins > selected.work_minutes && selected.work_minutes > 0} />
                    <Metric label="Excess Hrs" value={selected.work_minutes > stdMins ? minsToHM(selected.work_minutes - stdMins) : "0h 0m"} />
                    <Metric label="Late" value={selected.is_late ? "Yes" : "No"} highlight={selected.is_late} />
                  </div>
                </div>

                {/* Session details */}
                {selected.sessions.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Session Details</div>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Session</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">First In</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Last Out</th>
                            <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {selected.sessions.map((s, i) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-medium">Session {i + 1}</td>
                              <td className="px-3 py-2 font-mono">{fmtFull(s.in)}</td>
                              <td className="px-3 py-2 font-mono">{s.out ? fmtFull(s.out) : <span className="text-green-600">Active</span>}</td>
                              <td className="px-3 py-2">{s.duration_m > 0 ? minsToHM(s.duration_m) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Anomaly flags */}
                {selected.anomalies.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Flags</div>
                    <div className="space-y-1">
                      {selected.anomalies.map((a) => (
                        <div key={a} className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
                          ⚠ {a.replace(/_/g, " ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Leave info */}
                {selected.status === "on_leave" && (
                  <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">
                    <span className="font-semibold">{selected.leave_type}</span> — Approved leave
                  </div>
                )}

                {selected.status === "absent" && (
                  <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                    No attendance recorded — marked as Absent
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-border shadow-sm p-8 text-center">
              <div className="text-3xl mb-2">📅</div>
              <div className="text-sm font-medium text-foreground">Click any day</div>
              <div className="text-xs text-muted-foreground mt-1">to see session details, shift timing, and shortfall hours</div>
            </div>
          )}

          {/* Monthly summary card */}
          <div className="rounded-2xl bg-white border border-border shadow-sm p-5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Monthly Summary</div>
            <div className="space-y-2">
              {[
                { label: "Working Days", value: records.filter(r => r.status !== "non_working").length },
                { label: "Present", value: presentDays, color: "text-green-600" },
                { label: "Absent", value: absentDays, color: absentDays > 0 ? "text-red-600" : undefined },
                { label: "On Leave", value: leaveDays, color: "text-amber-600" },
                { label: "Late Arrivals", value: lateDays, color: lateDays > 0 ? "text-red-600" : undefined },
                { label: "Total Work Hrs", value: minsToHM(totalWorkMins) },
                { label: "Avg Work Hrs/Day", value: minsToHM(avgWorkMins) },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-semibold ${color ?? "text-foreground"}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayTag({ rec }: { rec: DayRecord }) {
  if (rec.status === "non_working") return <span className="rounded px-1 bg-gray-200 text-gray-500 text-[10px] font-bold">R</span>;
  if (rec.status === "on_leave") return <span className="rounded px-1 bg-amber-100 text-amber-700 text-[10px] font-bold">{rec.leave_type ?? "L"}</span>;
  if (rec.status === "absent") return <span className="rounded px-1 bg-red-100 text-red-700 text-[10px] font-bold">A</span>;
  if (rec.status === "clocked_out") return <span className="rounded px-1 bg-blue-100 text-blue-700 text-[10px] font-bold">CO</span>;
  return <span className="rounded px-1 bg-green-100 text-green-700 text-[10px] font-bold">P</span>;
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color ?? "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/20 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${highlight ? "text-red-600" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function minsToHM(mins: number): string {
  if (!mins) return "0h 0m";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtFull(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
