import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/live")({
  head: () => ({ meta: [{ title: "Live · J2W" }] }),
  component: AdminLive,
});

type Row = {
  id: string;
  user_id: string;
  event_type: string;
  ts_utc: string;
  geofence_status: string | null;
  accuracy_m: number | null;
  mock_flag: boolean;
  anomaly_flags: string[];
  profiles: { full_name: string | null; email: string | null } | null;
};

function AdminLive() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    async function load() {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("attendance_events")
        .select(
          "id,user_id,event_type,ts_utc,geofence_status,accuracy_m,mock_flag,anomaly_flags, profiles(full_name,email)",
        )
        .gte("ts_utc", dayStart.toISOString())
        .order("ts_utc", { ascending: false })
        .limit(200);
      setRows((data ?? []) as unknown as Row[]);
    }
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, []);

  const totalToday = rows.length;
  const flagged = rows.filter((r) => r.mock_flag || (r.anomaly_flags ?? []).length > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Events today" value={String(totalToday)} />
        <Stat label="Flagged events" value={String(flagged)} tone={flagged > 0 ? "warn" : "ok"} />
        <Stat label="Refresh" value="every 15s" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Today's punch stream</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Geofence</TableHead>
                <TableHead>Accuracy</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(r.ts_utc).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.profiles?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.profiles?.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.event_type === "punch_in" ? "default" : "secondary"}>
                      {r.event_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(r.geofence_status ?? "—").replace("inside_", "")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.accuracy_m ? `${Math.round(r.accuracy_m)} m` : "—"}
                  </TableCell>
                  <TableCell>
                    {r.mock_flag && <Badge variant="destructive" className="mr-1">mock</Badge>}
                    {(r.anomaly_flags ?? []).map((f) => (
                      <Badge key={f} variant="outline" className="mr-1">{f}</Badge>
                    ))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${tone === "warn" ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}