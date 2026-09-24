// Dynamic Expo config, layered on top of app.json.

const base = require('./app.json')

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY

const FORMA_DEMO_EMAIL = process.env.FORMA_DEMO_EMAIL
const FORMA_DEMO_PASSWORD = process.env.FORMA_DEMO_PASSWORD

let warned = false

module.exports = ({ config }) => {
  const expo = { ...(config ?? base.expo) }

  expo.extra = { ...(expo.extra ?? {}), googleMapsConfigured: Boolean(GOOGLE_MAPS_API_KEY) }

  if (FORMA_DEMO_EMAIL && FORMA_DEMO_PASSWORD) {
    expo.extra.demoAccount = { email: FORMA_DEMO_EMAIL, password: FORMA_DEMO_PASSWORD }
  } else if (FORMA_DEMO_EMAIL || FORMA_DEMO_PASSWORD) {
    console.warn(
      '\n⚠️  Only one of FORMA_DEMO_EMAIL / FORMA_DEMO_PASSWORD is set.\n' +
        '   Demo mode needs both, so the "Try Demo" button will not be shown.\n',
    )
  }

  if (GOOGLE_MAPS_API_KEY) {
    expo.plugins = [
      ...(expo.plugins ?? []),
      ['react-native-maps', { androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY }],
    ]
  } else if (!warned) {
    warned = true
    console.warn(
      '\n⚠️  GOOGLE_MAPS_API_KEY is not set.\n' +
        '   Maps work in Expo Go, but a dev/EAS build will ship without a Google Maps\n' +
        '   API key. The app detects this and shows a placeholder instead of the map,\n' +
        '   but live tracking still records distance, pace and calories. See app.config.js.\n',
    )
  }

  return expo
}
