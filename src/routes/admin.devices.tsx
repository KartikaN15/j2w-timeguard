import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { approveDevice } from "@/lib/punch.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/devices")({
  head: () => ({ meta: [{ title: "Device approvals · J2W" }] }),
  component: AdminDevices,
});

type Pending = {
  id: string;
  user_id: string;
  fingerprint: string;
  user_agent: string | null;
  requested_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

type Approved = {
  id: string;
  user_id: string;
  fingerprint: string;
  label: string | null;
  approved_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
};

function AdminDevices() {
  const [pending, setPending] = useState<Pending[]>([]);
  const [approved, setApproved] = useState<Approved[]>([]);
  const approveFn = useServerFn(approveDevice);

  async function load() {
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase
        .from("pending_devices")
        .select("id,user_id,fingerprint,user_agent,requested_at, profiles(full_name,email)")
        .order("requested_at", { ascending: true }),
      supabase
        .from("user_devices")
        .select("id,user_id,fingerprint,label,approved_at, profiles(full_name,email)")
        .order("approved_at", { ascending: false }),
    ]);
    setPending((p ?? []) as unknown as Pending[]);
    setApproved((a ?? []) as unknown as Approved[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(pendingRow: Pending) {
    const res = await approveFn({ data: { pending_id: pendingRow.id } });
    if (res.ok) {
      toast.success("Device approved.");
      load();
    } else {
      toast.error(res.reason);
    }
  }

  async function revoke(d: Approved) {
    if (!confirm("Revoke this device?")) return;
    const { error } = await supabase.from("user_devices").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Revoked.");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pending approvals ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                    Nothing pending.
                  </TableCell>
                </TableRow>
              )}
              {pending.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.profiles?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.profiles?.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.fingerprint.slice(0, 12)}…</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                    {p.user_agent}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.requested_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => approve(p)}>
                      Approve
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approved devices ({approved.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approved.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{d.profiles?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{d.profiles?.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.fingerprint.slice(0, 12)}…</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(d.approved_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => revoke(d)}>
                      Revoke
                    </Button>
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