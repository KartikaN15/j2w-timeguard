import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Props = {
  current: { lat: number; lng: number; accuracy?: number } | null;
  office?: { lat: number; lng: number; radius: number } | null;
  home?: { lat: number; lng: number; radius: number } | null;
  className?: string;
};

// Live geofence map (OpenStreetMap tiles, no API key). Shows the office/home
// zones as radius circles and the user's current position as a marker.
export function GeofenceMap({ current, office, home, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = current
      ? [current.lat, current.lng]
      : office
      ? [office.lat, office.lng]
      : [12.9716, 77.5946];
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false }).setView(center, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    // Leaflet needs a size recalc once the container is laid out
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw overlays when inputs change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    const bounds: L.LatLngExpression[] = [];

    if (office) {
      const c = L.circle([office.lat, office.lng], {
        radius: office.radius,
        color: "#8c2f52",
        fillColor: "#8c2f52",
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map).bindTooltip("Office zone");
      layersRef.current.push(c);
      bounds.push([office.lat, office.lng]);
    }

    if (home) {
      const c = L.circle([home.lat, home.lng], {
        radius: home.radius,
        color: "#16a34a",
        fillColor: "#16a34a",
        fillOpacity: 0.12,
        weight: 2,
      }).addTo(map).bindTooltip("Home zone");
      layersRef.current.push(c);
      bounds.push([home.lat, home.lng]);
    }

    if (current) {
      if (current.accuracy && current.accuracy > 0) {
        const acc = L.circle([current.lat, current.lng], {
          radius: current.accuracy,
          color: "#eab308",
          fillColor: "#eab308",
          fillOpacity: 0.12,
          weight: 1,
        }).addTo(map);
        layersRef.current.push(acc);
      }
      const dot = L.circleMarker([current.lat, current.lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: "#8c2f52",
        fillOpacity: 1,
      }).addTo(map).bindTooltip("You are here", { permanent: false });
      layersRef.current.push(dot);
      bounds.push([current.lat, current.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.4));
    }
  }, [current, office, home]);

  return <div ref={containerRef} className={className ?? "h-64 w-full rounded-xl overflow-hidden border border-border z-0"} />;
}
