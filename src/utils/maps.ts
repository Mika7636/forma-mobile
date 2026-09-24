// Whether native maps are usable in this build, and the region shape.

import { Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'

export interface MapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

const keyConfigured = Constants.expoConfig?.extra?.googleMapsConfigured === true

export const MAPS_AVAILABLE: boolean =
  Platform.OS === 'ios' ? true : Platform.OS === 'android' ? isExpoGo || keyConfigured : false

export const MAPS_UNAVAILABLE_REASON: string | null = MAPS_AVAILABLE
  ? null
  : Platform.OS === 'android'
    ? 'This build has no Google Maps API key.'
    : 'Maps are not supported on this platform.'
