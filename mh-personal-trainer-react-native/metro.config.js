const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = [
  'browser',
  'require',
  'react-native'
];

config.resolver.sourceExts.push('cjs');

config.resolver.unstable_enablePackageExports = false;

module.exports = config;
