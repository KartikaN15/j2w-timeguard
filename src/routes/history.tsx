import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
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

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History · J2W Attendance" }] }),
  component: HistoryPage,
});

type Row = {
  id: string;
  event_type: string;
  ts_utc: string;
  geofence_status: string | null;
  accuracy_m: number | null;
  mock_flag: boolean;
  anomaly_flags: string[];
};

function HistoryPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("attendance_events")
      .select("id,event_type,ts_utc,geofence_status,accuracy_m,mock_flag,anomaly_flags")
      .eq("user_id", user.id)
      .order("ts_utc", { ascending: false })
      .limit(100)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [user]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance history</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Geofence</TableHead>
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
              <TableRow key={r.id}>
                <TableCell>{new Date(r.ts_utc).toLocaleString()}</TableCell>
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
                <TableCell className="text-sm">
                  {r.mock_flag && (
                    <Badge variant="destructive" className="mr-1">mock</Badge>
                  )}
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
  );
}