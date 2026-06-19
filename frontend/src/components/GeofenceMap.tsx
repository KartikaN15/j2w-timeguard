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
  // Latest props, read inside the redraw effect without making it a dependency
  // (the parent re-renders every second for the live clock).
  const propsRef = useRef({ current, office, home });
  propsRef.current = { current, office, home };

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = current
      ? [current.lat, current.lng]
      : office
      ? [office.lat, office.lng]
      : [12.9716, 77.5946];
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false }).setView(center, 15);
    // Esri World Street Map — English/romanized labels (no API key needed).
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles © Esri",
    }).addTo(map);
    mapRef.current = map;
    // Leaflet needs a size recalc once the container is laid out
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Signature of the actual coordinates — only changes when a real value moves,
  // so manual zoom/pan is never reset by the per-second parent re-renders.
  const sig = JSON.stringify({
    c: current ? [current.lat, current.lng, current.accuracy] : null,
    o: office ? [office.lat, office.lng, office.radius] : null,
    h: home ? [home.lat, home.lng, home.radius] : null,
  });

  // Redraw overlays only when the coordinate signature changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { current, office, home } = propsRef.current;

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
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className={className ?? "h-64 w-full rounded-xl overflow-hidden border border-border z-0"} />;
}
