// Google Maps night styling, tuned to the dark palette.

export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0B1220' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94A3B8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0B1220' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#141E2E' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#16212F' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#132A20' }] },

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
