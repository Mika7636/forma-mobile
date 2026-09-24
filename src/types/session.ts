// The session document shape, and its GPS/HR sub-types.

export type SportType =
  | 'running'
  | 'swimming'
  | 'combat'
  | 'football'
  | 'cycling'
  | 'gym'
  | 'strength'

export interface SessionHRZone {
  zone: number
  name: string
  hrRange: string
}

export interface RoutePoint {
  latitude: number
  longitude: number
  timestamp: number
  altitude?: number
}

export interface SessionSplit {
  km: number
  seconds: number
  paceSecPerKm: number
  metres: number
  partial: boolean
}

export type TrackingMode = 'quick' | 'live'

export type GpsQuality = 'good' | 'partial' | 'none'

export interface Session {
  id: string
  userId: string
  sport: SportType
  date: string
  durationMinutes: number
  distanceKm?: number
  rpe: number
  loadScore: number
  notes?: string
  createdAt: string
  estimatedCalories?: number
  estimatedHRZone?: SessionHRZone
  pace?: string | null
  avgBpm?: number
  trackingMode?: TrackingMode
  routeCoordinates?: RoutePoint[]
  averagePace?: string
  averageSpeed?: number
  gpsQuality?: GpsQuality
  title?: string
  movingTimeMs?: number
  splits?: SessionSplit[]
  elevationGain?: number
}
