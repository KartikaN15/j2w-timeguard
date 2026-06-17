import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getPendingDevices,
  getApprovedDevices,
  approveDevice,
  rejectDevice,
  revokeDevice,
  type PendingDeviceRow,
  type ApprovedDeviceRow,
} from "@/backend/devices.api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  head: () => ({ meta: [{ title: "Device Approvals · J2W" }] }),
  component: AdminDevices,
});

function AdminDevices() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingDeviceRow[]>([]);
  const [approved, setApproved] = useState<ApprovedDeviceRow[]>([]);

  async function load() {
    const [p, a] = await Promise.all([getPendingDevices(), getApprovedDevices()]);
    setPending(p);
    setApproved(a);
  }

  useEffect(() => { load(); }, []);

  async function onApprove(row: PendingDeviceRow) {
    if (!user) return;
    const res = await approveDevice(row.id, user.id);
    if (res.ok) { toast.success("Device approved."); load(); }
    else toast.error(res.reason);
  }

  async function onReject(row: PendingDeviceRow) {
    if (!user || !confirm("Reject and remove this device request?")) return;
    await rejectDevice(row.id, user.id);
    toast.success("Device request rejected.");
    load();
  }

  async function onRevoke(row: ApprovedDeviceRow) {
    if (!user || !confirm("Revoke this device? The employee will not be able to punch in until re-approved.")) return;
    await revokeDevice(row.id, user.id);
    toast.success("Device revoked.");
    load();
  }

  return (
    <div className="space-y-6">
      {/* Pending */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Pending approvals</CardTitle>
          <Badge variant={pending.length > 0 ? "destructive" : "secondary"}>
            {pending.length}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Device / UA</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No pending requests.
                  </TableCell>
                </TableRow>
              )}
              {pending.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.fingerprint.slice(0, 14)}…
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {p.user_agent ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(p.requested_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => onApprove(p)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => onReject(p)}>Reject</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approved */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Approved devices</CardTitle>
          <Badge variant="secondary">{approved.length}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Fingerprint</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approved.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">{d.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{d.email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {d.fingerprint.slice(0, 14)}…
                  </TableCell>
                  <TableCell className="text-sm">{d.label ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(d.approved_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onRevoke(d)}>
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
