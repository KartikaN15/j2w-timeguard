import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getPendingLeaveRequests,
  getLeaveRequests,
  reviewLeave,
  type LeaveRequestRow,
} from "@/backend/leaves.api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/leaves")({
  head: () => ({ meta: [{ title: "Leave Approvals · J2W" }] }),
  component: AdminLeaves,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

function AdminLeaves() {
  const { user } = useAuth();
  const [pending, setPending] = useState<LeaveRequestRow[]>([]);
  const [all, setAll] = useState<LeaveRequestRow[]>([]);
  const [rejecting, setRejecting] = useState<LeaveRequestRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [p, a] = await Promise.all([getPendingLeaveRequests(), getLeaveRequests()]);
    setPending(p);
    setAll(a);
  }

  useEffect(() => { reload(); }, []);

  async function onApprove(req: LeaveRequestRow) {
    if (!user) return;
    setBusy(true);
    const res = await reviewLeave(req.id, "approved", user.id);
    setBusy(false);
    if (res.ok) { toast.success("Leave approved."); reload(); }
    else toast.error(res.reason);
  }

  async function onRejectSubmit() {
    if (!user || !rejecting) return;
    if (!rejectionReason.trim()) { toast.error("Please enter a rejection reason."); return; }
    setBusy(true);
    const res = await reviewLeave(rejecting.id, "rejected", user.id, rejectionReason);
    setBusy(false);
    if (res.ok) {
      toast.success("Leave rejected.");
      setRejecting(null);
      setRejectionReason("");
      reload();
    } else {
      toast.error(res.reason);
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Pending approval" value={String(pending.length)} tone={pending.length > 0 ? "warn" : undefined} />
        <Stat label="Approved this year" value={String(all.filter((r) => r.status === "approved").length)} tone="ok" />
        <Stat label="Total requests" value={String(all.length)} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-destructive text-destructive-foreground px-1.5 text-[10px] font-bold">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All requests</TabsTrigger>
        </TabsList>

        {/* Pending tab */}
        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending leave requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No pending requests. 🎉
                      </TableCell>
                    </TableRow>
                  )}
                  {pending.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.leave_type.code}</Badge>
                        <div className="text-xs text-muted-foreground">{r.leave_type.name}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.from_date}</TableCell>
                      <TableCell className="text-sm">{r.to_date}</TableCell>
                      <TableCell className="text-sm font-medium">{r.total_days}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {r.reason ?? <span className="italic">No reason given</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            className="gap-1"
                            disabled={busy}
                            onClick={() => onApprove(r)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => { setRejecting(r); setRejectionReason(""); }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All requests tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All leave requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewed</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {all.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.leave_type.code}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {r.from_date}
                        {r.from_date !== r.to_date && ` → ${r.to_date}`}
                      </TableCell>
                      <TableCell className="text-sm">{r.total_days}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] text-xs text-muted-foreground truncate">
                        {r.rejection_reason ?? r.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rejection dialog */}
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
          </DialogHeader>
          {rejecting && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="font-medium">{rejecting.employee_name}</div>
                <div className="text-muted-foreground">
                  {rejecting.leave_type.name} · {rejecting.from_date}
                  {rejecting.from_date !== rejecting.to_date && ` → ${rejecting.to_date}`}
                  {" "}· {rejecting.total_days} day{rejecting.total_days !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Rejection reason <span className="text-destructive">*</span></Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide a reason so the employee can re-apply if needed…"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={onRejectSubmit} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold ${
          tone === "warn" ? "text-destructive" : tone === "ok" ? "text-green-600" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
