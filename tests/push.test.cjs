const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
function fixture({ os = 'android', device = true, projectId = 'test-project', granted = true, switchAccount = false } = {}) {
  const calls = [], auth = { currentUser: { uid: 'alice' } }; let handler;
  const api = load('src/lib/push.ts', {
    'expo-device': { isDevice: device },
    'expo-constants': { easConfig: { projectId } },
    'react-native': { Platform: { OS: os } },
    './firebase': { auth, db: {} },
    'firebase/firestore': { doc: (_db, collection, uid) => `${collection}/${uid}`, setDoc: async (ref, data) => calls.push({ write: ref, data }), serverTimestamp: () => 'server timestamp' },
    'expo-notifications': {
      setNotificationHandler: value => { handler = value; },
      AndroidImportance: { DEFAULT: 3 },
      setNotificationChannelAsync: async () => calls.push('channel'),
      getPermissionsAsync: async () => { calls.push('permissions'); return { status: 'undetermined' }; },
      requestPermissionsAsync: async () => { calls.push('request'); return { status: granted ? 'granted' : 'denied' }; },
      getExpoPushTokenAsync: async options => { calls.push({ token: options.projectId }); if (switchAccount) auth.currentUser = { uid: 'bob' }; return { data: 'test-token' }; },
    },
  });
  return { ...api, calls, handler, auth };
}
test('foreground notification behavior uses SDK 54 fields', async () => {
  const f = fixture(), behavior = await f.handler.handleNotification();
  assert.equal(behavior.shouldShowBanner, true); assert.equal(behavior.shouldShowList, true);
  assert.equal(behavior.shouldPlaySound, false);
});
test('Android channel precedes permission; explicit EAS project and private token storage are used', async () => {
  const f = fixture(); assert.equal(await f.registerForPush(), 'test-token');
  assert.deepEqual(f.calls.slice(0, 3), ['channel', 'permissions', 'request']);
  assert.equal(f.calls[3].token, 'test-project'); assert.equal(f.calls[4].write, 'pushTokens/alice');
});
test('no token registration on web, simulator, denied permission or missing session', async () => {
  for (const options of [{ os: 'web' }, { device: false }, { granted: false }]) {
    const f = fixture(options); assert.equal(await f.registerForPush(), null);
    assert.ok(!f.calls.some(call => call.token || call.write));
  }
  const f = fixture(); f.auth.currentUser = null;
  assert.equal(await f.registerForPush(), null); assert.equal(f.calls.length, 0);
});
test('missing EAS project fails clearly and account changes cannot store another session’s token', async () => {
  const missing = fixture({ projectId: null });
  await assert.rejects(missing.registerForPush(), /not configured/);
  assert.equal(missing.calls.length, 0);
  const switched = fixture({ switchAccount: true });
  assert.equal(await switched.registerForPush(), null);
  assert.ok(!switched.calls.some(call => call.write));
});
