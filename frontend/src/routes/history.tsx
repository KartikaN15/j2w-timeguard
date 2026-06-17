import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getHistoryFn, getMonthAttendanceFn } from "@/backend/server-fns";
import type { AttendanceEvent, DayRecord } from "@/backend/server-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History · J2W Attendance" }] }),
  component: HistoryPage,
});

const PAGE_SIZE = 10;

export function GeofenceBadge({ status }: { status: string | null }) {
  const s = status ?? "—";
  const label = s.replace("inside_", "");
  const cls =
    s === "inside_office"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
      : s === "inside_home"
      ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
      : s === "outside"
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      : "bg-muted text-muted-foreground";
  return <Badge className={cls}>{label}</Badge>;
}

function HistoryPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AttendanceEvent[]>([]);
  const [fetching, setFetching] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    getHistoryFn().then((data) => {
      setRows(data);
      setFetching(false);
    });
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const flagged = rows.filter((r) => r.mock_flag || r.anomaly_flags.length > 0);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-6">
      {flagged.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          ⚠️ {flagged.length} flagged event{flagged.length !== 1 ? "s" : ""} in your history. HR has been notified.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Attendance history ({rows.length} events)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Accuracy</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No punch events yet.
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map((r) => (
                <TableRow key={r.id} className={r.anomaly_flags.length > 0 ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                  <TableCell className="text-sm">
                    <div>{new Date(r.ts_utc).toLocaleDateString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.ts_utc).toLocaleTimeString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.event_type === "punch_in" ? "default" : "secondary"}>
                      {r.event_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <GeofenceBadge status={r.geofence_status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.accuracy_m ? `${Math.round(r.accuracy_m)} m` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.mock_flag && (
                      <Badge variant="destructive" className="mr-1">mock</Badge>
                    )}
                    {r.anomaly_flags.map((f) => (
                      <Badge key={f} variant="outline" className="mr-1 text-xs">
                        {f.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="text-xs text-muted-foreground">
              Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Monthly calendar view */}
      {user && <MonthCalendar userId={user.id} />}
    </div>
  );
}

// ── Month calendar (employee's own attendance) ───────────────────────────────
function MonthCalendar({ userId }: { userId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    getMonthAttendanceFn({ data: { userId, year, month } })
      .then(setRecords)
      .finally(() => setBusy(false));
  }, [userId, year, month]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    if (new Date(ny, nm - 1, 1) > new Date()) return;
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
  }

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (DayRecord | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return records.find((r) => r.date === key) ?? null;
    }),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const presentDays = records.filter((r) => r.status === "present" || r.status === "clocked_out").length;
  const leaveDays = records.filter((r) => r.status === "on_leave").length;
  const absentDays = records.filter((r) => r.status === "absent").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Calendar — {monthName}</CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary + legend */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4 text-xs">
            <span className="text-green-600 font-semibold">{presentDays} Present</span>
            <span className="text-amber-600 font-semibold">{leaveDays} Leave</span>
            <span className={absentDays > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>{absentDays} Absent</span>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            {[
              { color: "bg-green-500", label: "P" },
              { color: "bg-blue-500", label: "CO" },
              { color: "bg-amber-400", label: "L" },
              { color: "bg-red-400", label: "A" },
              { color: "bg-gray-300", label: "R" },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1 text-muted-foreground">
                <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}
              </span>
            ))}
          </div>
        </div>

        {busy ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-7 border-b border-border bg-muted/20">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((rec, i) => {
                const dayNum = i - firstDay + 1;
                const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const isToday = rec?.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={i} className={`min-h-[64px] border-b border-r border-border p-1.5 ${rec ? "" : "bg-muted/10"} ${!inMonth ? "opacity-30" : ""}`}>
                    {inMonth && (
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${isToday ? "bg-primary text-white" : "text-foreground"}`}>
                        {dayNum}
                      </div>
                    )}
                    {rec && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        <DayTag rec={rec} />
                        {rec.schedule_type !== "OFF" && (
                          <div className="text-[9px] text-muted-foreground font-mono">{rec.schedule_type}</div>
                        )}
                        {rec.is_late && <span className="text-[9px] text-amber-600 font-semibold">LATE</span>}
                        {rec.work_minutes > 0 && (
                          <div className="text-[9px] text-muted-foreground">{minsToHM(rec.work_minutes)}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DayTag({ rec }: { rec: DayRecord }) {
  if (rec.status === "non_working") return <span className="rounded px-1 bg-gray-200 text-gray-500 text-[10px] font-bold w-fit">R</span>;
  if (rec.status === "on_leave") return <span className="rounded px-1 bg-amber-100 text-amber-700 text-[10px] font-bold w-fit">{rec.leave_type ?? "L"}</span>;
  if (rec.status === "absent") return <span className="rounded px-1 bg-red-100 text-red-700 text-[10px] font-bold w-fit">A</span>;
  if (rec.status === "clocked_out") return <span className="rounded px-1 bg-blue-100 text-blue-700 text-[10px] font-bold w-fit">CO</span>;
  return <span className="rounded px-1 bg-green-100 text-green-700 text-[10px] font-bold w-fit">P</span>;
}

function minsToHM(mins: number): string {
  if (!mins) return "0h 0m";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
