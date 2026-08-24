/**
 * Google Maps night styling, tuned to `theme/tokens`.
 *
 * The summary screen is dark; the default Google basemap is a bright, saturated
 * street map. Dropping one into the other was the single loudest thing making
 * the finished-workout screen look unfinished — a white rectangle punched
 * through a dark page, with the route line fighting road casings for attention.
 *
 * The palette here is deliberately *quiet*: the map is a backdrop for one green
 * line, so labels, POIs and transit are pushed right down and the water/land
 * separation is carried by two near-identical dark greys. Anything more
 * decorative competes with the route, which is the only thing on this map the
 * athlete actually wants to look at.
 *
 * Android only — iOS uses Apple Maps, which ignores `customMapStyle` and follows
 * the system appearance instead (`userInterfaceStyle: 'dark'` on the MapView).
 */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0B1220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1220' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Land use: one step up from the ground so parks and built-up areas read as
  // shape rather than as colour.
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#141E2E' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#16212F' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#132A20' }] },

  // Roads: visible enough to recognise where you ran, dim enough that the route
  // is unambiguously the brightest thing on the map.
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1B2739' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#243247' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#243247' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2C3B52' }] },

  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },

  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A1A2B' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3E5570' }] },
] as const
