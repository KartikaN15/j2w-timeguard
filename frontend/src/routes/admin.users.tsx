import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  getEmployeeListFn,
  createEmployeeFn,
  type CreateEmployeeInput,
} from "@/backend/server-fns";

type EmployeeRow = {
  id: string; full_name: string; email: string; client_company: string;
  roles: string[];
  config: { weekly_schedule: Record<string, string>; office_lat?: number | null; home_lat?: number | null } | null;
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  UserPlus, Users, Building2, Copy, Check, Eye, EyeOff,
  Loader2, ShieldCheck, MapPin, Calendar, MoreHorizontal, X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "User Management · J2W HR" }] }),
  component: UsersPage,
});

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const SCHEDULE_COLORS: Record<string, string> = {
  WFO: "bg-blue-100 text-blue-700",
  WFH: "bg-green-100 text-green-700",
  OFF: "bg-gray-100 text-gray-500",
  FLEX: "bg-purple-100 text-purple-700",
};

type NewCreds = { full_name: string; email: string; password: string };

function UsersPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newCreds, setNewCreds] = useState<NewCreds | null>(null);
  const [search, setSearch] = useState("");

  async function reload() {
    const rows = await getEmployeeListFn();
    setEmployees(rows as EmployeeRow[]);
  }

  useEffect(() => { reload(); }, []);

  const filtered = employees.filter((e) =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase()) ||
    e.client_company.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: employees.length,
    wfo: employees.filter((e) => ["mon", "tue", "wed", "thu", "fri"].some((d) => e.config?.weekly_schedule?.[d] === "WFO")).length,
    clients: new Set(employees.map((e) => e.client_company)).size,
    admins: employees.filter((e) => e.roles.includes("hr_admin")).length,
  };

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create accounts and manage employee access</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2 shadow-sm">
          <UserPlus className="h-4 w-4" />
          Add Employee
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Employees", value: stats.total, icon: "👥", bg: "bg-blue-50 border-blue-100", val: "text-blue-700" },
          { label: "Client Sites", value: stats.clients, icon: "🏢", bg: "bg-purple-50 border-purple-100", val: "text-purple-700" },
          { label: "WFO Schedules", value: stats.wfo, icon: "🏛️", bg: "bg-green-50 border-green-100", val: "text-green-700" },
          { label: "HR Admins", value: stats.admins, icon: "🛡️", bg: "bg-amber-50 border-amber-100", val: "text-amber-700" },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="text-lg">{s.icon}</span>
            </div>
            <div className={`text-2xl font-bold ${s.val}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + table */}
      <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="font-semibold text-sm">All Employees</h3>
          <div className="flex-1" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or company…"
            className="h-8 w-48 sm:w-64 rounded-lg border border-border bg-muted/30 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                {["Employee", "Client", "Role", "Schedule", "Geofence", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((emp) => {
                const initials = emp.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                const isAdmin = emp.roles.includes("hr_admin") || emp.roles.includes("super_admin");
                const hasOffice = emp.config?.office_lat != null;
                const hasHome = emp.config?.home_lat != null;
                return (
                  <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-foreground">{emp.full_name}</div>
                          <div className="text-xs text-muted-foreground">{emp.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {emp.client_company}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAdmin
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700"><ShieldCheck className="h-3 w-3" />HR Admin</span>
                        : <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">Employee</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-0.5 flex-wrap">
                        {DAY_KEYS.map((d) => {
                          const s = emp.config?.weekly_schedule?.[d] ?? "OFF";
                          return (
                            <span key={d} title={`${d}: ${s}`}
                              className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${SCHEDULE_COLORS[s]}`}>
                              {d.slice(0, 1).toUpperCase()}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-xs">
                        <span className={`flex items-center gap-1 ${hasOffice ? "text-green-600" : "text-muted-foreground/50"}`}>
                          <Building2 className="h-3 w-3" />{hasOffice ? "Office ✓" : "Office —"}
                        </span>
                        <span className={`flex items-center gap-1 ${hasHome ? "text-green-600" : "text-muted-foreground/50"}`}>
                          <MapPin className="h-3 w-3" />{hasHome ? "Home ✓" : "Home —"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/admin/attendance/$userId" params={{ userId: emp.id }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
                        <Calendar className="h-3 w-3" />Logs
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add New Employee
            </DialogTitle>
          </DialogHeader>
          <AddEmployeeForm
            onCreated={(creds) => {
              setShowAdd(false);
              setNewCreds(creds);
              reload();
              toast.success(`Account created for ${creds.full_name}`);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Credentials reveal dialog */}
      {newCreds && (
        <CredentialsDialog creds={newCreds} onClose={() => setNewCreds(null)} />
      )}
    </div>
  );
}

// ── Add Employee Form ──────────────────────────────────────────────────────────

function AddEmployeeForm({ onCreated, onCancel }: {
  onCreated: (creds: NewCreds) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [showPwd, setShowPwd] = useState(false);
  const [clientCompany, setClientCompany] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [schedule, setSchedule] = useState<Record<string, string>>({
    mon: "WFO", tue: "WFO", wed: "WFH", thu: "WFO", fri: "WFH", sat: "OFF", sun: "OFF",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!fullName.trim() || !email.trim() || !clientCompany.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setBusy(true);
    const res = await createEmployeeFn({ data: {
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      client_company: clientCompany.trim(),
      roles: isAdmin ? ["hr_admin", "employee"] : ["employee"],
      weekly_schedule: schedule,
    } as CreateEmployeeInput });
    setBusy(false);
    if (res.ok) {
      onCreated({ full_name: fullName.trim(), email: email.trim().toLowerCase(), password });
    } else {
      toast.error(res.reason);
    }
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Full Name <span className="text-red-500">*</span></Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Arjun Mehta" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Work Email <span className="text-red-500">*</span></Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="arjun@client.com" type="email" className="h-9" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Password</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input value={password} onChange={(e) => setPassword(e.target.value)}
              type={showPwd ? "text" : "password"} className="h-9 pr-10 font-mono text-xs" />
            <button onClick={() => setShowPwd(!showPwd)} type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button variant="outline" size="sm" type="button" className="h-9 px-3 text-xs"
            onClick={() => setPassword(generatePassword())}>Regenerate</Button>
        </div>
        <p className="text-[10px] text-muted-foreground">Share this with the employee after creation.</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Client / Deployment Company <span className="text-red-500">*</span></Label>
        <Input value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="GE Healthcare" className="h-9" />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Weekly Work Schedule</Label>
        <div className="grid grid-cols-7 gap-1">
          {DAY_KEYS.map((d) => (
            <div key={d} className="text-center">
              <div className="text-[10px] text-muted-foreground mb-1 capitalize">{d.slice(0, 3)}</div>
              <Select value={schedule[d]} onValueChange={(v) => setSchedule((s) => ({ ...s, [d]: v }))}>
                <SelectTrigger className="h-8 w-full px-1 text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["WFO", "WFH", "FLEX", "OFF"].map((v) => (
                    <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <input type="checkbox" id="is-admin" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)}
          className="h-4 w-4 rounded accent-primary" />
        <label htmlFor="is-admin" className="flex-1 cursor-pointer">
          <div className="text-sm font-medium">Grant HR Admin access</div>
          <div className="text-xs text-muted-foreground">Can view dashboards, approve leaves, manage employees</div>
        </label>
        {isAdmin && <ShieldCheck className="h-4 w-4 text-purple-600 shrink-0" />}
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        <Button onClick={submit} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
          Create Account
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Credentials Dialog ─────────────────────────────────────────────────────────

function CredentialsDialog({ creds, onClose }: { creds: NewCreds; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copyAll() {
    const text = `J2W Attendance — Login Credentials\n\nURL: ${window.location.origin}/auth\nEmail: ${creds.email}\nPassword: ${creds.password}\n\nPlease change your password after first login.`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-brand px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-white/60 uppercase tracking-wider mb-1">Account Created</div>
              <h2 className="text-lg font-bold">{creds.full_name}</h2>
              <p className="text-sm text-white/70 mt-0.5">Share these credentials with the employee</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-xl border border-border bg-muted/20 divide-y divide-border overflow-hidden">
            <CredRow label="Login URL" value={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth`} />
            <CredRow label="Email" value={creds.email} />
            <CredRow label="Password" value={creds.password} mono />
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            ⚠ This password is shown only once. Copy it before closing.
          </div>

          <div className="flex gap-2">
            <Button onClick={copyAll} className="flex-1 gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy All Credentials"}
            </Button>
            <Button variant="outline" onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CredRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium mt-0.5 ${mono ? "font-mono tracking-wider" : ""}`}>{value}</div>
      </div>
      <button onClick={copy} className="shrink-0 rounded-lg p-1.5 hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
