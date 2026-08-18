import { Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'

/**
 * Region shape accepted by the map, mirrored here so callers (the live tracker)
 * can describe a camera target without importing `react-native-maps`. Keeping
 * that import confined to the map component is the whole point of this module —
 * see {@link MAPS_AVAILABLE}.
 */
export interface MapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

/**
 * True when this build is running inside the Expo Go client, which ships its
 * own Google Maps API key and so renders maps regardless of our configuration.
 * This is why the map looks fine on the emulator and dies on the phone.
 */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

/**
 * True when the binary was built with `GOOGLE_MAPS_API_KEY` set, so
 * `com.google.android.geo.API_KEY` is present in the manifest. Written by
 * app.config.js at build time; see the long comment there.
 */
const keyConfigured = Constants.expoConfig?.extra?.googleMapsConfigured === true

/**
 * Whether it is safe to mount a Google map on this device+build.
 *
 * **This is a crash guard, not a cosmetic one.** On Android the Google Maps SDK
 * needs `com.google.android.geo.API_KEY` in the manifest. Without it the SDK
 * fails to authorise, and the failure is not graceful: `MapsInitializer` never
 * completes, so the first camera operation react-native-maps issues against the
 * map throws `IllegalStateException: CameraUpdateFactory is not initialized`
 * from *Java*. That kills the process. No JS try/catch and no React error
 * boundary can intercept it, because the throw never passes through JS.
 *
 * Newer Play Services builds often degrade to a blank grey map instead, which is
 * why a modern emulator or phone can survive the same APK that kills an older
 * device — the Galaxy A7 (2018) on Android 8/9 carries an older Play Services
 * and takes the throwing path.
 *
 * iOS is unaffected: react-native-maps defaults to Apple Maps there, which needs
 * no key. Web has no native map at all.
 */
export const MAPS_AVAILABLE: boolean =
  Platform.OS === 'ios' ? true : Platform.OS === 'android' ? isExpoGo || keyConfigured : false

/**
 * Why the map is hidden, for the placeholder's benefit. `null` when maps work.
 */
export const MAPS_UNAVAILABLE_REASON: string | null = MAPS_AVAILABLE
  ? null
  : Platform.OS === 'android'
    ? 'This build has no Google Maps API key.'
    : 'Maps are not supported on this platform.'
