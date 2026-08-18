// Dynamic Expo config layered on top of app.json.
//
// Why this file exists: `react-native-maps` needs a Google Maps Android API key
// baked into the native manifest. In **Expo Go** the map works without one,
// because Expo Go supplies its own key — which is exactly why the map behaves
// on the emulator and fails on a real EAS build.
//
// Worse, react-native-maps' own config plugin does not merely skip the key when
// none is configured, it *removes* `com.google.android.geo.API_KEY` from the
// manifest (see node_modules/react-native-maps/plugin/build/android.js). So a
// build with no key produces an app whose Google Maps SDK cannot authorise:
// the map surface fails to initialise, and map operations against it are a
// known source of native crashes during live tracking.
//
// The key is read from the environment so it never lands in git:
//
//   Local dev build : set GOOGLE_MAPS_API_KEY in your shell before `npx expo …`
//   EAS build       : eas env:set --name GOOGLE_MAPS_API_KEY --value <your key> \
//                       --visibility sensitive \
//                       --environment development preview production
//
// Visibility must be `sensitive`, not `secret`: secret-type variables are not
// readable outside EAS servers, so they are unavailable while EAS CLI resolves
// this dynamic app config — the key would silently drop out of the manifest.
// The key is embedded in the APK regardless; it is protected by the package +
// SHA-1 restrictions on the key itself, not by hiding it.
//
// Get a key from https://console.cloud.google.com/ → APIs & Services →
// Credentials, with the "Maps SDK for Android" API enabled. Restrict it to the
// app's package name (com.forma.fitnesstracker) and its signing SHA-1.
//
// Expo Go needs none of this and is unaffected.

const base = require('./app.json')

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY

// Expo evaluates this config several times per command; warn once per process
// so the notice is visible without burying the Metro log.
let warned = false

module.exports = ({ config }) => {
  // `config` is app.json already parsed by Expo; fall back to the require for
  // the rare callers that invoke this without one.
  const expo = { ...(config ?? base.expo) }

  // Recorded so the *running app* can tell whether this binary was built with a
  // key, and skip mounting a map that cannot possibly authorise. Only the
  // boolean is exposed - never the key itself - because `extra` is readable from
  // JS at runtime, and the app has no reason to know the value.
  expo.extra = { ...(expo.extra ?? {}), googleMapsConfigured: Boolean(GOOGLE_MAPS_API_KEY) }

  if (GOOGLE_MAPS_API_KEY) {
    expo.plugins = [
      ...(expo.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY }],
    ]
  } else if (!warned) {
    warned = true
    // Loud, because a silently key-less build looks fine until someone starts a
    // run. Expo Go prints this too and can be ignored there.
    console.warn(
      '\n⚠️  GOOGLE_MAPS_API_KEY is not set.\n' +
        '   Maps work in Expo Go, but a dev/EAS build will ship without a Google Maps\n' +
        '   API key. The app detects this and shows a placeholder instead of the map,\n' +
        '   but live tracking still records distance, pace and calories. See app.config.js.\n',
    )
  }

  return expo
}
