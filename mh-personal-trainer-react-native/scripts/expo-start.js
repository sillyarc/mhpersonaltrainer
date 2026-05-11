const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const expoCliPath = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const args = process.argv.slice(2);

const parseNodeVersion = (version) => version.split('.').map((part) => Number.parseInt(part, 10));

const isSupportedNodeVersion = () => {
  const [major, minor, patch] = parseNodeVersion(process.versions.node);
  if (major > 20 && major < 23) return true;
  if (major === 20 && (minor > 19 || (minor === 19 && patch >= 4))) return true;
  return false;
};

const getPortableNodePath = () => {
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home || process.platform !== 'win32') return '';
  return path.join(home, '.mhpersonaltrainer', 'node', 'node-v22.22.2-win-x64', 'node.exe');
};

const runChild = (command, childArgs, extraEnv = {}) => {
  const child = spawn(command, childArgs, {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...extraEnv,
      NODE_ENV: process.env.NODE_ENV ?? 'development',
      EXPO_OFFLINE: 'true',
      EXPO_NO_DEPENDENCY_VALIDATION: 'true',
      EXPO_NO_TELEMETRY: process.env.EXPO_NO_TELEMETRY ?? 'true',
    },
    stdio: 'inherit',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
};

if (!isSupportedNodeVersion() && process.env.MH_EXPO_NODE_REEXEC !== '1') {
  const portableNodePath = getPortableNodePath();
  if (portableNodePath && fs.existsSync(portableNodePath)) {
    runChild(portableNodePath, [__filename, ...args], { MH_EXPO_NODE_REEXEC: '1' });
  } else {
    console.warn(
      `Node ${process.version} is outside this project's supported range (>=20.19.4 <23).`
    );
    runChild(process.execPath, [expoCliPath, 'start', ...args]);
  }
} else {
  runChild(process.execPath, [expoCliPath, 'start', ...args]);
}
