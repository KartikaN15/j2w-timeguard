import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Employees · J2W" }] }),
  component: AdminEmployees,
});

type Emp = {
  user_id: string;
  office_lat: number | null;
  office_lng: number | null;
  office_radius_m: number;
  home_lat: number | null;
  home_lng: number | null;
  home_radius_m: number;
  profiles: { full_name: string | null; email: string | null } | null;
};

function AdminEmployees() {
  const [rows, setRows] = useState<Emp[]>([]);
  const [editing, setEditing] = useState<Emp | null>(null);

  async function load() {
    const { data } = await supabase
      .from("employee_config")
      .select(
        "user_id,office_lat,office_lng,office_radius_m,home_lat,home_lng,home_radius_m, profiles(full_name,email)",
      );
    setRows((data ?? []) as unknown as Emp[]);
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee geofence configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Home</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.user_id}>
                <TableCell>
                  <div className="font-medium">{r.profiles?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.profiles?.email}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.office_lat != null
                    ? `${r.office_lat.toFixed(5)}, ${r.office_lng?.toFixed(5)} · ${r.office_radius_m}m`
                    : "Not set"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.home_lat != null
                    ? `${r.home_lat.toFixed(5)}, ${r.home_lng?.toFixed(5)} · ${r.home_radius_m}m`
                    : "Not set"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          {editing && (
            <EditDialog
              row={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                load();
              }}
            />
          )}
        </Dialog>
      </CardContent>
    </Card>
  );
}

function EditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: Emp;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [officeLat, setOfficeLat] = useState(row.office_lat?.toString() ?? "");
  const [officeLng, setOfficeLng] = useState(row.office_lng?.toString() ?? "");
  const [officeR, setOfficeR] = useState(String(row.office_radius_m));
  const [homeLat, setHomeLat] = useState(row.home_lat?.toString() ?? "");
  const [homeLng, setHomeLng] = useState(row.home_lng?.toString() ?? "");
  const [homeR, setHomeR] = useState(String(row.home_radius_m));
  const [busy, setBusy] = useState(false);

  async function useCurrent(setLat: (v: string) => void, setLng: (v: string) => void) {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
      },
      (e) => toast.error(e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("employee_config")
      .update({
        office_lat: officeLat ? Number(officeLat) : null,
        office_lng: officeLng ? Number(officeLng) : null,
        office_radius_m: Number(officeR) || 150,
        home_lat: homeLat ? Number(homeLat) : null,
        home_lng: homeLng ? Number(homeLng) : null,
        home_radius_m: Number(homeR) || 200,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", row.user_id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved.");
      onSaved();
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>
          Geofence · {row.profiles?.full_name ?? row.profiles?.email}
        </DialogTitle>
      </DialogHeader>
      <div className="grid gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Office (WFO days)</div>
            <Button size="sm" variant="ghost" onClick={() => useCurrent(setOfficeLat, setOfficeLng)}>
              Use my current location
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Lat" value={officeLat} onChange={setOfficeLat} />
            <Field label="Lng" value={officeLng} onChange={setOfficeLng} />
            <Field label="Radius (m)" value={officeR} onChange={setOfficeR} />
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Home (WFH days)</div>
            <Button size="sm" variant="ghost" onClick={() => useCurrent(setHomeLat, setHomeLng)}>
              Use my current location
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Lat" value={homeLat} onChange={setHomeLat} />
            <Field label="Lng" value={homeLng} onChange={setHomeLng} />
            <Field label="Radius (m)" value={homeR} onChange={setHomeR} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}