const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/private/defaults/exclusionList').default;
const path = require('node:path');

const config = getDefaultConfig(__dirname);
const escapePathForRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pathSepPattern = path.sep === '\\' ? '\\\\' : '/';

const blockedFolders = [
  '.adb-home',
  '.adbhome',
  '.android',
  '.android-prefs',
  '.android-user-home',
  '.g',
  '.gradle-build-fresh',
  '.gradle-install-android',
  '.gradle-local',
  '.idea',
  'android',
  'c',
];

config.resolver.blockList = exclusionList(
  blockedFolders.map(
    (folder) => new RegExp(`${escapePathForRegex(path.join(__dirname, folder))}${pathSepPattern}.*`)
  )
);

config.resolver.unstable_conditionNames = [
  'browser',
  'require',
  'react-native'
];

config.resolver.sourceExts.push('cjs');

config.resolver.unstable_enablePackageExports = false;

module.exports = config;
