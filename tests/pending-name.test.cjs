const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

// Each fixture is a fresh module memory over a stand-in auth whose user can change.
function launch(uid = 'alice') {
  const auth = { currentUser: uid ? { uid } : null };
  const { pendingName } = load('src/lib/pending-name.ts', { './firebase': { auth } });
  return { pendingName, auth };
}

test('a name is handed over once, trimmed, then gone', () => {
  const { pendingName } = launch();
  pendingName.set('  Aiko ');
  assert.equal(pendingName.take(), 'Aiko');
  assert.equal(pendingName.take(), null);
});

test('a name never crosses accounts on the same phone', () => {
  const { pendingName, auth } = launch('alice');
  pendingName.set('Aiko');
  auth.currentUser = { uid: 'bob' };
  assert.equal(pendingName.take(), null);
  auth.currentUser = { uid: 'alice' };
  assert.equal(pendingName.take(), 'Aiko');
});

test('nothing is kept without a signed in account, an empty name, or after clear', () => {
  const signedOut = launch(null);
  signedOut.pendingName.set('Aiko');
  signedOut.auth.currentUser = { uid: 'alice' };
  assert.equal(signedOut.pendingName.take(), null);

  const { pendingName } = launch();
  pendingName.set('   ');
  assert.equal(pendingName.take(), null);
  pendingName.set('Aiko');
  pendingName.clear();
  assert.equal(pendingName.take(), null);
});
