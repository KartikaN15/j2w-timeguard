import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getHistoryFn } from "@/backend/server-fns";
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
import { Loader2 } from "lucide-react";
import type { AttendanceEvent } from "@/backend/mock-db";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History · J2W Attendance" }] }),
  component: HistoryPage,
});

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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    getHistoryFn({ data: user.id }).then((data) => {
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
              {rows.map((r) => (
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
      </Card>
    </div>
  );
}
