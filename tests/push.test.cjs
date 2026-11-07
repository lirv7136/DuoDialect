const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const REGISTRATION_KEY = 'push.registration.v1';
function fixture({ os = 'android', device = true, projectId = 'test-project', granted = true, switchAccount = false, stored = null, legacyToken = 'test-token', failDelete = false, failRelease = false } = {}) {
  const calls = [], storage = new Map(), auth = { currentUser: { uid: 'alice' } }; let handler;
  if (stored) storage.set(REGISTRATION_KEY, JSON.stringify(stored));
  const api = load('src/lib/push.ts', {
    'expo-device': { isDevice: device },
    'expo-constants': { easConfig: { projectId } },
    'react-native': { Platform: { OS: os } },
    './firebase': { auth, db: {} },
    './api': { api: { releasePushToken: async input => { calls.push({ release: input }); if (failRelease) throw new Error('offline'); return { released: 2 }; } } },
    '../domain/push-device': load('src/domain/push-device.ts'),
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async key => { storage.delete(key); },
    },
    'firebase/firestore': {
      doc: (_db, ...segments) => segments.join('/'),
      setDoc: async (ref, data) => calls.push({ write: ref, data }),
      deleteDoc: async ref => { if (failDelete) throw new Error('offline'); calls.push({ remove: ref }); },
      getDoc: async ref => { calls.push({ read: ref }); return { exists: () => legacyToken !== null, get: () => legacyToken }; },
      serverTimestamp: () => 'server timestamp',
    },
    'expo-notifications': {
      setNotificationHandler: value => { handler = value; },
      AndroidImportance: { DEFAULT: 3 },
      setNotificationChannelAsync: async () => calls.push('channel'),
      getPermissionsAsync: async () => { calls.push('permissions'); return { status: 'undetermined' }; },
      requestPermissionsAsync: async () => { calls.push('request'); return { status: granted ? 'granted' : 'denied' }; },
      getExpoPushTokenAsync: async options => { calls.push({ token: options.projectId }); if (switchAccount) auth.currentUser = { uid: 'bob' }; return { data: 'test-token' }; },
    },
  });
  const registration = () => JSON.parse(storage.get(REGISTRATION_KEY) ?? 'null');
  return { ...api, calls, handler, auth, storage, registration };
}
const { deviceIdFromToken } = load('src/domain/push-device.ts');
// The loader runs modules in another context, so compare structure rather than prototypes.
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));
const DEVICE_ID = deviceIdFromToken('test-token');
const writes = f => f.calls.filter(call => call.write).map(call => call.write);
const removes = f => f.calls.filter(call => call.remove).map(call => call.remove);

test('foreground notification behavior uses SDK 54 fields', async () => {
  const f = fixture(), behavior = await f.handler.handleNotification();
  assert.equal(behavior.shouldShowBanner, true); assert.equal(behavior.shouldShowList, true);
  assert.equal(behavior.shouldPlaySound, false);
});
test('Android channel precedes permission; explicit EAS project; a device document and the legacy document are both written', async () => {
  const f = fixture(); assert.equal(await f.registerForPush(), 'test-token');
  assert.deepEqual(f.calls.slice(0, 3), ['channel', 'permissions', 'request']);
  assert.equal(f.calls[3].token, 'test-project');
  assert.deepEqual(writes(f).sort(), [`pushTokens/alice`, `pushTokens/alice/devices/${DEVICE_ID}`]);
  for (const call of f.calls.filter(c => c.write)) same(call.data, { token: 'test-token', platform: 'android', updatedAt: 'server timestamp' });
  same(f.registration(), { uid: 'alice', deviceId: DEVICE_ID, token: 'test-token' });
  assert.ok(!f.calls.some(call => call.release), 'nothing to release on a fresh install');
});
test('no token registration on web, simulator, denied permission or missing session', async () => {
  for (const options of [{ os: 'web' }, { device: false }, { granted: false }]) {
    const f = fixture(options); assert.equal(await f.registerForPush(), null);
    assert.ok(!f.calls.some(call => call.token || call.write));
    assert.equal(f.registration(), null);
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
test('registering for a new account first revokes what the previous account left on this phone', async () => {
  const bob = { uid: 'bob', deviceId: 'd_old', token: 'ExponentPushToken[bob]' };
  const f = fixture({ stored: bob });
  assert.equal(await f.registerForPush(), 'test-token');
  const release = f.calls.findIndex(call => call.release), firstWrite = f.calls.findIndex(call => call.write);
  same(f.calls[release].release, bob);
  assert.ok(release < firstWrite, 'the old registration goes before the new one is written');
  same(f.registration(), { uid: 'alice', deviceId: DEVICE_ID, token: 'test-token' });
});
test('releaseStaleRegistration leaves the same account alone and keeps the record when the server cannot be reached', async () => {
  const alice = { uid: 'alice', deviceId: DEVICE_ID, token: 'test-token' };
  const sameAccount = fixture({ stored: alice }); await sameAccount.releaseStaleRegistration();
  assert.equal(sameAccount.calls.length, 0); same(sameAccount.registration(), alice);
  const bob = { uid: 'bob', deviceId: 'd_old', token: 'ExponentPushToken[bob]' };
  const offline = fixture({ stored: bob, failRelease: true }); await offline.releaseStaleRegistration();
  same(offline.calls, [{ release: bob }]); same(offline.registration(), bob, 'retried next launch');
  const online = fixture({ stored: bob }); await online.releaseStaleRegistration();
  assert.equal(online.registration(), null);
});
test('logout deletes this device’s documents for the signed in account, the legacy one only when it holds this token', async () => {
  const alice = { uid: 'alice', deviceId: DEVICE_ID, token: 'test-token' };
  const f = fixture({ stored: alice }); await f.releasePushRegistration();
  assert.deepEqual(removes(f).sort(), ['pushTokens/alice', `pushTokens/alice/devices/${DEVICE_ID}`]);
  assert.equal(f.registration(), null);
  const other = fixture({ stored: alice, legacyToken: 'ExponentPushToken[other-phone]' }); await other.releasePushRegistration();
  assert.deepEqual(removes(other), [`pushTokens/alice/devices/${DEVICE_ID}`], 'another phone’s legacy token is kept');
  const none = fixture({ stored: alice, legacyToken: null }); await none.releasePushRegistration();
  assert.deepEqual(removes(none), [`pushTokens/alice/devices/${DEVICE_ID}`]);
});
test('logout never throws when the network is down, and remembers the registration for a later attempt', async () => {
  const alice = { uid: 'alice', deviceId: DEVICE_ID, token: 'test-token' };
  const f = fixture({ stored: alice, failDelete: true });
  await assert.doesNotReject(f.releasePushRegistration());
  same(f.registration(), alice);
  const idle = fixture(); await idle.releasePushRegistration(); assert.equal(idle.calls.length, 0);
  const signedOut = fixture({ stored: alice }); signedOut.auth.currentUser = null;
  await signedOut.releasePushRegistration(); assert.equal(signedOut.calls.length, 0); same(signedOut.registration(), alice);
});
test('logout as a different account than the stored one asks the server to release it', async () => {
  const bob = { uid: 'bob', deviceId: 'd_old', token: 'ExponentPushToken[bob]' };
  const f = fixture({ stored: bob }); await f.releasePushRegistration();
  same(f.calls, [{ release: bob }]); assert.equal(f.registration(), null);
});
