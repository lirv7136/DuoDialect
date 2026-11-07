const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const output = mkdtempSync(path.join(os.tmpdir(), 'duodialect-native-bundles-'));
const env = { ...process.env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', CI: '1',
  EXPO_PUBLIC_FIREBASE_API_KEY: 'demo-api-key',
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-duodialect.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-duodialect',
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'demo-duodialect.appspot.com',
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:demoduodialect',
};
const result = spawnSync(process.execPath, [path.resolve(__dirname, '../node_modules/expo/bin/cli'), 'export', '--platform', 'ios', '--platform', 'android', '--output-dir', output], { stdio: 'inherit', env, cwd: path.resolve(__dirname, '..') });
if (result.error) console.error(result.error.message);
if (result.status === 0) console.log(`Native JS bundle check passed: ${output}\nThese are bundles with dummy configuration, not signed or installable store builds.`);
process.exit(result.status ?? 1);
