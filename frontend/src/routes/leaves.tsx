import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getLeaveTypesFn, getLeaveBalancesFn, getLeaveRequestsFn, applyLeaveFn, cancelLeaveFn, getApproversFn,
  type LeaveTypeRow, type LeaveBalanceRow, type LeaveRequestRow, type ApproverRow,
} from "@/backend/server-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/DatePicker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Paperclip, X } from "lucide-react";

type Tab = "apply" | "pending" | "history" | "balances";

export const Route = createFileRoute("/leaves")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as Tab) || "apply",
  }),
  head: () => ({ meta: [{ title: "Leave · J2W Attendance" }] }),
  component: LeavesPage,
});

type BalanceRow = LeaveBalanceRow;
type RequestRow = LeaveRequestRow;

const NO_APPROVER: ApproverRow = { id: "", name: "HR Team", role: "Pending HR assignment" };

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function LeavesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeRow[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  async function reload() {
    if (!user) return;
    const [bal, reqs, types] = await Promise.all([
      getLeaveBalancesFn(),
      getLeaveRequestsFn(),
      getLeaveTypesFn(),
    ]);
    setBalances(bal);
    setRequests(reqs);
    setLeaveTypes(types);
    setFetching(false);
  }

  useEffect(() => { if (user) reload(); }, [user]);

  function switchTab(t: Tab) {
    navigate({ to: "/leaves", search: { tab: t } });
  }

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  if (loading || fetching) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex gap-6 flex-col xl:flex-row">
      {/* ── Main leave content ── */}
      <div className="flex-1 min-w-0">
        {/* Tabs — greytHR style */}
        <div className="mb-0 flex border-b border-border">
          {(["apply", "pending", "history", "balances"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors relative
                ${tab === t
                  ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {t === "apply" ? "Apply" : t === "pending" ? `Pending (${pending.length})` : t === "history" ? "History" : "Balances"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-0 rounded-b-xl bg-white border border-t-0 border-border shadow-sm">
          {tab === "apply" && (
            <ApplyTab
              user={user!}
              leaveTypes={leaveTypes}
              balances={balances}
              onApplied={() => { reload(); switchTab("pending"); }}
            />
          )}
          {tab === "pending" && <RequestList requests={pending} user={user!} onAction={reload} emptyText="No pending leave requests." />}
          {tab === "history" && <RequestList requests={history} user={user!} onAction={reload} emptyText="No past leave history." />}
          {tab === "balances" && <BalancesTab balances={balances} />}
        </div>
      </div>

      {/* ── Right sidebar — Leave Balances ── */}
      <div className="w-full xl:w-60 shrink-0">
        <div className="rounded-xl border border-border bg-white shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3">Leave Balances</h3>
          <div className="space-y-4">
            {balances.map((b) => {
              const avail = b.total_days - b.used_days - b.pending_days;
              const pct = b.total_days > 0 ? Math.round((avail / b.total_days) * 100) : 0;
              return (
                <div key={b.leave_type_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary text-[10px]">{b.leave_type.code}</span>
                      <span className="text-xs text-foreground">{b.leave_type.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">{avail}/{b.total_days}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {b.used_days} used{b.pending_days > 0 ? ` · ${b.pending_days} pending` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Apply Leave Tab ────────────────────────────────────────────────────────────

function ApplyTab({ user, leaveTypes, balances, onApplied }: {
  user: { id: string };
  leaveTypes: LeaveTypeRow[];
  balances: BalanceRow[];
  onApplied: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [fromSession, setFromSession] = useState<"1" | "2">("1");
  const [toSession, setToSession] = useState<"1" | "2">("2");
  const [reason, setReason] = useState("");
  const [contactDetails, setContactDetails] = useState("");
  const [approvers, setApprovers] = useState<ApproverRow[]>([]);
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

  // Load the real list of HR admins who can approve leave.
  useEffect(() => {
    getApproversFn().then((apprs) => {
      setApprovers(apprs);
      if (apprs.length > 0) setManagerId((cur) => cur || apprs[0].id);
    });
  }, []);

  const selectedManager = approvers.find((m) => m.id === managerId) ?? approvers[0] ?? NO_APPROVER;
  const managerInitials = selectedManager.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const selectedType = leaveTypes.find((lt) => lt.id === leaveTypeId);
  const selectedBalance = balances.find((b) => b.leave_type_id === leaveTypeId);
  const available = selectedBalance ? selectedBalance.total_days - selectedBalance.used_days - selectedBalance.pending_days : 0;

  // Compute total days
  const from = new Date(fromDate + "T12:00:00");
  const to = new Date(toDate + "T12:00:00");
  const daysDiff = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000)) + 1;
  let totalDays = daysDiff;
  if (fromSession === "2") totalDays -= 0.5;
  if (toSession === "1") totalDays -= 0.5;
  totalDays = Math.max(0.5, totalDays);

  // Determine day_type for API
  const dayType = daysDiff === 1
    ? (fromSession === "1" && toSession === "2" ? "full" : fromSession === "1" ? "first_half" : "second_half")
    : "full";

  async function submit() {
    if (!fromDate || !toDate) { toast.error("Please fill all required fields."); return; }
    setBusy(true);
    const res = await applyLeaveFn({ data: {
      leave_type_id: leaveTypeId,
      from_date: fromDate,
      to_date: toDate,
      reason,
    } });
    setBusy(false);
    if (res.ok) { toast.success("Leave request submitted successfully."); onApplied(); }
    else toast.error(res.reason);
  }

  return (
    <div className="p-6">
      {/* Info banner */}
      {showInfo && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs text-blue-700 leading-relaxed">
            Leave is earned by an employee and granted by the employer to take time off work. The employee is free to avail this leave in accordance with the company policy.
          </p>
          <button onClick={() => setShowInfo(false)} className="shrink-0 text-blue-400 hover:text-blue-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <h2 className="text-base font-semibold mb-5">Applying for Leave</h2>

      <div className="grid gap-5 lg:grid-cols-[1fr,220px]">
        {/* Form */}
        <div className="space-y-5">
          {/* Leave type */}
          <div className="space-y-1.5">
            <Label className="text-sm">Leave type <span className="text-red-500">*</span></Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger className="w-72 h-10">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>{lt.label} ({lt.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date + Session row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">From date <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <DatePicker value={fromDate} onChange={(v) => { setFromDate(v); if (v > toDate) setToDate(v); }} className="flex-1" />
                <Select value={fromSession} onValueChange={(v) => setFromSession(v as "1" | "2")}>
                  <SelectTrigger className="w-32 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Session 1</SelectItem>
                    <SelectItem value="2">Session 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">To date <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <DatePicker value={toDate} onChange={setToDate} min={fromDate} className="flex-1" />
                <Select value={toSession} onValueChange={(v) => setToSession(v as "1" | "2")}>
                  <SelectTrigger className="w-32 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Session 1</SelectItem>
                    <SelectItem value="2">Session 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Session legend */}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Session 1 = 09:30–13:00 (Morning)</span>
            <span>Session 2 = 13:01–18:30 (Afternoon)</span>
          </div>

          {/* Applying to */}
          <div className="space-y-1.5">
            <Label className="text-sm">Applying to</Label>
            <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 bg-muted/20">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {managerInitials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{selectedManager.name}</div>
                <div className="text-xs text-muted-foreground">{selectedManager.role}</div>
              </div>
              {approvers.length > 0 && (
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger className="w-28 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {approvers.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Contact details */}
          <div className="space-y-1.5">
            <Label className="text-sm">Contact details during leave</Label>
            <Input
              value={contactDetails}
              onChange={(e) => setContactDetails(e.target.value)}
              placeholder="Phone number or email reachable during leave"
              className="h-10"
            />
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label className="text-sm">Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Enter a reason for your leave request…"
              className="resize-none"
            />
          </div>

          {/* Attach file (UI only for demo) */}
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Paperclip className="h-4 w-4" />
              Attach File
            </button>
            <span className="text-xs text-muted-foreground">File Types: pdf, xls, xlsx, doc, docx, txt, jpg, jpeg, png</span>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Button onClick={submit} disabled={busy} className="px-6">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
            <Button variant="outline" onClick={() => {}} className="px-6">Cancel</Button>
          </div>
        </div>

        {/* Leave balance side panel */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="text-xs text-muted-foreground mb-1">Leave Balance</div>
            <div className="text-2xl font-bold text-foreground">{available}</div>
            <div className="text-xs text-muted-foreground">days available ({selectedType?.code})</div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${selectedBalance ? Math.round(((selectedBalance.total_days - selectedBalance.used_days - selectedBalance.pending_days) / selectedBalance.total_days) * 100) : 0}%` }} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Applying for</div>
            <div className="text-xl font-bold text-primary">{totalDays} day{totalDays !== 1 ? "s" : ""}</div>
            <div className="text-[11px] text-muted-foreground">
              {fromDate === toDate ? (
                fromSession === "1" && toSession === "2" ? "Full day" : fromSession === "1" ? "Morning (Session 1)" : "Afternoon (Session 2)"
              ) : (
                `${fromDate} to ${toDate}`
              )}
            </div>
          </div>

          {totalDays > available && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              ⚠ Insufficient balance. You have {available} day{available !== 1 ? "s" : ""} available but are applying for {totalDays}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Request List ───────────────────────────────────────────────────────────────

function RequestList({ requests, user, onAction, emptyText }: {
  requests: RequestRow[];
  user: { id: string };
  onAction: () => void;
  emptyText: string;
}) {
  async function onCancel(r: RequestRow) {
    if (!confirm("Cancel this leave request?")) return;
    const res = await cancelLeaveFn({ data: { requestId: r.id } });
    if (res.ok) { toast.success("Leave request cancelled."); onAction(); }
    else toast.error(res.reason);
  }

  if (requests.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <div className="text-3xl mb-2">📅</div>
        <div className="text-sm">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {requests.map((r) => (
        <div key={r.id} className="flex items-start gap-4 p-5 hover:bg-muted/20">
          <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold
            ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "pending" ? "bg-amber-100 text-amber-700" : r.status === "rejected" ? "bg-red-100 text-red-600" : "bg-muted text-muted-foreground"}`}>
            {r.leave_type.code}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{r.leave_type.label}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[r.status]}`}>
                {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
              </span>
              {r.status === "pending" && (
                <button onClick={() => onCancel(r)} className="text-xs text-red-500 hover:underline">Cancel</button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{r.from_date} → {r.to_date}</span>
              <span>·</span>
              <span>{r.days} day{r.days !== 1 ? "s" : ""}</span>
            </div>
            {r.reason && <div className="mt-1 text-xs text-muted-foreground">Reason: {r.reason}</div>}
            {r.status === "rejected" && r.reason && (
              <div className="mt-1.5 rounded-lg bg-red-50 border border-red-100 px-3 py-1.5 text-xs text-red-700">
                Rejected: {r.reason}
              </div>
            )}
            {r.reviewed_at && (
              <div className="mt-1 text-[11px] text-muted-foreground/60">
                Reviewed {new Date(r.reviewed_at).toLocaleDateString("en-IN")}
              </div>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground whitespace-nowrap">
            {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Balances Tab ───────────────────────────────────────────────────────────────

function BalancesTab({ balances }: { balances: BalanceRow[] }) {
  return (
    <div className="p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {balances.map((b) => {
          const available = b.total_days - b.used_days - b.pending_days;
          const pct = b.total_days > 0 ? Math.round((available / b.total_days) * 100) : 0;
          return (
            <div key={b.leave_type_id} className="rounded-xl border border-border p-5 bg-muted/20">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{b.leave_type.code}</div>
                  <div className="text-sm text-foreground mt-0.5">{b.leave_type.label}</div>
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${b.leave_type.is_paid ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  {b.leave_type.is_paid ? "Paid" : "Unpaid"}
                </span>
              </div>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-3xl font-bold text-foreground">{available}</span>
                <span className="mb-1 text-sm text-muted-foreground">/ {b.total_days} days</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <div className="rounded-lg bg-white border border-border p-2">
                  <div className="text-sm font-bold">{b.total_days}</div>
                  <div className="text-[10px] text-muted-foreground">Total</div>
                </div>
                <div className="rounded-lg bg-white border border-border p-2">
                  <div className="text-sm font-bold text-green-600">{available}</div>
                  <div className="text-[10px] text-muted-foreground">Available</div>
                </div>
                <div className="rounded-lg bg-white border border-border p-2">
                  <div className="text-sm font-bold text-muted-foreground">{b.used_days}</div>
                  <div className="text-[10px] text-muted-foreground">Used</div>
                </div>
              </div>
              {b.pending_days > 0 && (
                <div className="mt-2 text-center text-xs text-amber-600">{b.pending_days} day{b.pending_days !== 1 ? "s" : ""} pending approval</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
