// Metro, Expo's bundler, with Sentry's additions: each bundle gets a debug ID
// so crash reports point at the right line of DisCamp's code.
// https://docs.sentry.io/platforms/react-native/manual-setup/expo/

const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// The word filter library ("obscenity") publishes an ES module entry that
// re-exports its CommonJS build in a way Metro's web bundle can't read (the
// web preview crashed on start). Use its CommonJS build on every platform;
// iPhone and Android already did.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'obscenity') return { type: 'sourceFile', filePath: require.resolve('obscenity') };
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
