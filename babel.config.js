module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      // jsxImportSource: 'nativewind' lets className flow through to native views.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // react-native-worklets/plugin powers Reanimated 4 and MUST be listed last.
      'react-native-worklets/plugin',
    ],
  }
}
