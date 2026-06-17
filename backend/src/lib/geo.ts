export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export type GeofenceResult =
  | { status: 'inside_office'; distance_m: number }
  | { status: 'inside_home'; distance_m: number }
  | { status: 'outside'; nearest_m: number }
  | { status: 'no_config' }

export function evaluateGeofence(
  lat: number,
  lng: number,
  cfg: {
    office_lat: number | null
    office_lng: number | null
    office_radius_m: number
    home_lat: number | null
    home_lng: number | null
    home_radius_m: number
  },
): GeofenceResult {
  const hasOffice = cfg.office_lat != null && cfg.office_lng != null
  const hasHome = cfg.home_lat != null && cfg.home_lng != null
  if (!hasOffice && !hasHome) return { status: 'no_config' }

  let officeD = Infinity
  let homeD = Infinity
  if (hasOffice) officeD = haversineMeters(lat, lng, cfg.office_lat!, cfg.office_lng!)
  if (hasHome) homeD = haversineMeters(lat, lng, cfg.home_lat!, cfg.home_lng!)

  if (officeD <= cfg.office_radius_m) return { status: 'inside_office', distance_m: officeD }
  if (homeD <= cfg.home_radius_m) return { status: 'inside_home', distance_m: homeD }
  return { status: 'outside', nearest_m: Math.min(officeD, homeD) }
}
