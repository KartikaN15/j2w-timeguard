import { createFileRoute, Link } from "@tanstack/react-router";
import { expandMapUrl } from "@/lib/maps.functions";
import { useEffect, useState } from "react";
import {
  getEmployeeListFn, updateEmployeeConfigFn, getCompanyConfigFn, updateCompanyConfigFn,
  type EmployeeConfig,
} from "@/backend/server-fns";

type CompanyConfig = { id: number; office_name: string; office_lat: number | null; office_lng: number | null; office_radius_m: number; shift_start: string; shift_end?: string; late_threshold_min: number; updated_at: string }
type EmployeeRow = { id: string; full_name: string | null; email: string | null; client_company: string | null; roles: string[]; config: EmployeeConfig | null }
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Home, MapPin, ExternalLink, Loader2, Search, Navigation } from "lucide-react";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Employees · J2W" }] }),
  component: AdminEmployees,
});

const DAY_LABELS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SCHEDULE_OPTIONS = ["WFO", "WFH", "OFF", "FLEX"];

function AdminEmployees() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [companyCfg, setCompanyCfg] = useState<CompanyConfig | null>(null);
  const [officeSetLoading, setOfficeSetLoading] = useState(false);
  const [officeEdit, setOfficeEdit] = useState(false);
  const [officeForm, setOfficeForm] = useState({ name: "", lat: "", lng: "", radius: "2000" });
  const [addrQuery, setAddrQuery] = useState("");
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrResults, setAddrResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);

  useEffect(() => {
    getEmployeeListFn().then((data) => setRows(data as unknown as EmployeeRow[]));
    getCompanyConfigFn().then((cfg) => {
      if (!cfg) return;
      setCompanyCfg(cfg as CompanyConfig);
      setOfficeForm({ name: cfg.office_name, lat: cfg.office_lat?.toString() ?? "", lng: cfg.office_lng?.toString() ?? "", radius: String(cfg.office_radius_m) });
    });
  }, []);

  async function searchAddress() {
    const input = addrQuery.trim();
    if (!input) return;

    // ── 1. Try extracting coords directly from the input (full Maps URL or bare coords) ──
    const direct = extractGoogleMapsCoords(input);
    if (direct) {
      setOfficeForm((f) => ({ ...f, lat: direct.lat.toFixed(6), lng: direct.lng.toFixed(6) }));
      setAddrQuery("");
      toast.success("Coordinates extracted from Google Maps link.");
      return;
    }

    // ── 2. Looks like a short URL (maps.app.goo.gl / goo.gl) — expand server-side ──
    const isShortUrl = /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl|bit\.ly|tinyurl\.com)/i.test(input);
    if (isShortUrl) {
      setAddrLoading(true);
      try {
        const { finalUrl } = await expandMapUrl({ data: input });
        if (finalUrl) {
          const coords = extractGoogleMapsCoords(finalUrl);
          if (coords) {
            setOfficeForm((f) => ({ ...f, lat: coords.lat.toFixed(6), lng: coords.lng.toFixed(6) }));
            setAddrQuery("");
            toast.success("Location extracted from Google Maps link.");
            return;
          }
        }
        toast.error("Couldn't extract coordinates from that link. Try opening it in your browser, then copy the full URL from the address bar and paste that instead.");
      } catch {
        toast.error("Failed to resolve the short link. Paste the full Google Maps URL instead.");
      } finally {
        setAddrLoading(false);
      }
      return;
    }

    // ── 3. Plain text → search via Nominatim ──
    setAddrLoading(true);
    setAddrResults([]);
    try {
      const base = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1`;
      const indiaUrl = `${base}&countrycodes=in&q=${encodeURIComponent(input)}`;
      let res = await fetch(indiaUrl);
      let data = await res.json();
      if (data.length === 0) {
        const globalUrl = `${base}&q=${encodeURIComponent(input)}`;
        res = await fetch(globalUrl);
        data = await res.json();
      }
      setAddrResults(data);
      if (data.length === 0) {
        toast.error('No results. Try a locality like "Whitefield, Bangalore" or paste the full Google Maps URL from your browser address bar.');
      }
    } catch {
      toast.error("Search failed. Check your connection.");
    } finally {
      setAddrLoading(false);
    }
  }

  function extractGoogleMapsCoords(input: string): { lat: number; lng: number } | null {
    // Pattern: @lat,lng or q=lat,lng or /place/.../lat,lng
    const patterns = [
      /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,           // @12.9716,77.5946
      /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,       // ?q=12.9716,77.5946
      /\/(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/,       // /12.97160,77.59460
      /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/,       // bare "12.9716, 77.5946"
    ];
    for (const re of patterns) {
      const m = input.match(re);
      if (m) {
        const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
      }
    }
    return null;
  }

  function pickAddressResult(r: { display_name: string; lat: string; lon: string }) {
    setOfficeForm((f) => ({ ...f, lat: Number(r.lat).toFixed(6), lng: Number(r.lon).toFixed(6) }));
    setAddrResults([]);
    setAddrQuery("");
    toast.success("Location set from address search.");
  }

  async function useGPSForOffice() {
    setOfficeSetLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setOfficeSetLoading(false);
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setOfficeForm((f) => ({ ...f, lat, lng }));
        toast.success(`GPS captured: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (e) => { setOfficeSetLoading(false); toast.error(e.message); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  async function saveOffice() {
    await updateCompanyConfigFn({ data: {
      office_name: officeForm.name || companyCfg?.office_name,
      office_lat: officeForm.lat ? Number(officeForm.lat) : null,
      office_lng: officeForm.lng ? Number(officeForm.lng) : null,
      office_radius_m: Number(officeForm.radius) || 2000,
    }});
    const updated = await getCompanyConfigFn();
    if (updated) setCompanyCfg(updated as CompanyConfig);
    setOfficeEdit(false);
    toast.success("Office location saved. All employees will use this for WFO geofence.");
  }

  return (
    <div className="space-y-6">
      {/* ── Shared Office Location ── */}
      <div className="rounded-2xl bg-white border border-border shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-base">{companyCfg?.office_name ?? "Company Office"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shared for all employees on WFO days — set once by HR
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOfficeEdit(true)}>
            {companyCfg?.office_lat ? "Edit Office Location" : "Set Office Location"}
          </Button>
        </div>

        {companyCfg?.office_lat ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoTile label="Latitude" value={companyCfg.office_lat.toFixed(6)} />
            <InfoTile label="Longitude" value={companyCfg.office_lng?.toFixed(6) ?? "—"} />
            <InfoTile label="Radius" value={`${companyCfg.office_radius_m}m`} />
            <InfoTile label="Shift" value={`${companyCfg.shift_start} – ${companyCfg.shift_end}`} />
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <MapPin className="h-5 w-5 shrink-0 text-amber-500" />
            Office location not set. Click "Set Office Location" and use your GPS or enter coordinates manually. All employees on WFO days will be geofenced to this location.
          </div>
        )}
      </div>

      {/* ── Employee Table ── */}
      <div className="rounded-2xl bg-white border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">Employee Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Home location · weekly schedule · leave config per employee</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Home Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekly Schedule</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.full_name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.email ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.client_company ?? '—'}</td>
                  <td className="px-4 py-3">
                    {r.config?.home_lat != null ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Home className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <span className="font-mono">{r.config.home_lat.toFixed(4)}, {r.config.home_lng?.toFixed(4)}</span>
                        <span className="text-muted-foreground/50">· {r.config.home_radius_m}m</span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1"><Home className="h-3.5 w-3.5" /> Not set</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {DAY_LABELS.filter(d => !["sat", "sun"].includes(d)).map((d) => {
                        const val = (r.config?.weekly_schedule ?? {})[d] ?? "WFO";
                        return (
                          <Badge key={d} className={
                            val === "WFO" ? "bg-blue-100 text-blue-700 text-[10px]"
                            : val === "WFH" ? "bg-green-100 text-green-700 text-[10px]"
                            : "bg-muted text-muted-foreground text-[10px]"
                          }>
                            {d.charAt(0).toUpperCase()}: {val}
                          </Badge>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit</Button>
                      <Link to="/admin/attendance/$userId" params={{ userId: r.id }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        Logs <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Office location dialog ── */}
      <Dialog open={officeEdit} onOpenChange={(o) => { if (!o) { setOfficeEdit(false); setAddrResults([]); setAddrQuery(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" /> Set Company Office Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Office Name</Label>
              <Input value={officeForm.name} onChange={(e) => setOfficeForm(f => ({ ...f, name: e.target.value }))} placeholder="J2W Head Office – Bangalore" />
            </div>

            {/* ── Option A: Google Maps link or address search ── */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <Search className="h-4 w-4" />
                Search address or paste Google Maps link
              </div>
              <div className="space-y-1 text-xs text-blue-700">
                <p><strong>Option 1:</strong> Open Google Maps → find the office → copy the URL → paste below.</p>
                <p><strong>Option 2:</strong> Type a full address like <em>"Whitefield, Bangalore, Karnataka"</em> and press Search.</p>
              </div>
              <div className="flex gap-2">
                <Input
                  value={addrQuery}
                  onChange={(e) => { setAddrQuery(e.target.value); setAddrResults([]); }}
                  onKeyDown={(e) => e.key === "Enter" && searchAddress()}
                  placeholder="Paste maps.google.com link or type address…"
                  className="h-9 text-sm flex-1 bg-white"
                />
                <Button size="sm" variant="default" disabled={addrLoading || !addrQuery.trim()} onClick={searchAddress} className="shrink-0">
                  {addrLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {addrResults.length > 0 && (
                <div className="rounded-lg border border-border bg-white shadow-sm divide-y divide-border overflow-hidden max-h-44 overflow-y-auto">
                  {addrResults.map((r, i) => (
                    <button key={i} type="button" onClick={() => pickAddressResult(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors">
                      <div className="text-xs font-medium text-foreground leading-snug">{r.display_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{Number(r.lat).toFixed(5)}, {Number(r.lon).toFixed(5)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Option B: Use GPS ── */}
            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 border-t border-border" />
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" disabled={officeSetLoading} onClick={useGPSForOffice}>
              {officeSetLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Getting GPS…</>
                : <><Navigation className="h-3.5 w-3.5 text-green-600" />Use my current GPS location</>}
            </Button>

            {/* ── Coordinates preview ── */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Coordinates</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Latitude</Label>
                  <Input value={officeForm.lat} onChange={(e) => setOfficeForm(f => ({ ...f, lat: e.target.value }))} placeholder="12.9716" className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Longitude</Label>
                  <Input value={officeForm.lng} onChange={(e) => setOfficeForm(f => ({ ...f, lng: e.target.value }))} placeholder="77.5946" className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Radius (m)</Label>
                  <Input value={officeForm.radius} onChange={(e) => setOfficeForm(f => ({ ...f, radius: e.target.value }))} className="h-9 text-sm" />
                </div>
              </div>
            </div>

            {/* Google Maps preview link */}
            {officeForm.lat && officeForm.lng && (
              <a
                href={`https://www.google.com/maps?q=${officeForm.lat},${officeForm.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Verify on Google Maps — {Number(officeForm.lat).toFixed(4)}, {Number(officeForm.lng).toFixed(4)}
              </a>
            )}

            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
              Applies to <strong>all WFO employees</strong>. They must punch within <strong>{officeForm.radius}m</strong> of these coordinates.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOfficeEdit(false); setAddrResults([]); }}>Cancel</Button>
            <Button onClick={saveOffice} disabled={!officeForm.lat || !officeForm.lng}>Save Office Location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Employee edit dialog ── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditDialog
            row={editing}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); getEmployeeListFn().then((data) => setRows(data as unknown as EmployeeRow[])); }}
          />
        )}
      </Dialog>
    </div>
  );
}

function EditDialog({ row, onClose, onSaved }: { row: EmployeeRow; onClose: () => void; onSaved: () => void }) {
  const cfg = row.config;
  const [homeLat, setHomeLat] = useState(cfg?.home_lat?.toString() ?? "");
  const [homeLng, setHomeLng] = useState(cfg?.home_lng?.toString() ?? "");
  const [homeR, setHomeR] = useState(String(cfg?.home_radius_m ?? 200));
  const [schedule, setSchedule] = useState<Record<string, string>>({ ...(cfg?.weekly_schedule ?? {}) });
  const [busy, setBusy] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  function useGPS() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHomeLat(p.coords.latitude.toFixed(6));
        setHomeLng(p.coords.longitude.toFixed(6));
        setGpsLoading(false);
        toast.success(`Home GPS captured ±${Math.round(p.coords.accuracy)}m`);
      },
      (e) => { toast.error(e.message); setGpsLoading(false); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function save() {
    setBusy(true);
    await updateEmployeeConfigFn({ data: {
      targetUserId: row.id,
      config: {
        home_lat: homeLat ? Number(homeLat) : null,
        home_lng: homeLng ? Number(homeLng) : null,
        home_radius_m: Number(homeR) || 200,
        weekly_schedule: schedule,
      },
    }});
    setBusy(false);
    toast.success("Employee config saved.");
    onSaved();
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Edit Config · {row.full_name}</DialogTitle>
      </DialogHeader>

      <div className="space-y-5">
        {/* Home location */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2"><Home className="h-4 w-4 text-green-600" /> Home Location (WFH days)</span>
            <Button size="sm" variant="ghost" disabled={gpsLoading} onClick={useGPS}>
              {gpsLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Getting…</> : "Use my GPS"}
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Latitude" value={homeLat} onChange={setHomeLat} />
            <Field label="Longitude" value={homeLng} onChange={setHomeLng} />
            <Field label="Radius (m)" value={homeR} onChange={setHomeR} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">Employee must be within this radius of home on WFH days.</p>
        </div>

        {/* Weekly schedule */}
        <div>
          <div className="mb-2 text-sm font-semibold">Weekly Schedule</div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_LABELS.map((day) => (
              <div key={day} className="space-y-1">
                <Label className="text-center text-xs text-muted-foreground block">
                  {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                </Label>
                <Select value={schedule[day] ?? "WFO"} onValueChange={(v) => setSchedule((p) => ({ ...p, [day]: v }))}>
                  <SelectTrigger className="h-8 px-1.5 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_OPTIONS.map((o) => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            WFO = office geofence enforced · WFH = home geofence enforced · OFF = non-working day
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm font-mono" />
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold font-mono text-foreground">{value ?? "—"}</div>
    </div>
  );
}
