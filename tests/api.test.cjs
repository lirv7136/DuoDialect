const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const errors = load('src/domain/errors.ts');

function fixture(respond = () => ({ ok: true })) {
  const calls = [];
  const functions = { region: 'test' };
  const mod = load('src/lib/api.ts', {
    './firebase': { functions },
    '../domain/errors': errors,
    'firebase/functions': {
      httpsCallable: (instance, name) => async data => {
        assert.equal(instance, functions);
        calls.push({ name, data: JSON.parse(JSON.stringify(data)) });
        return { data: await respond(name, data) };
      },
    },
  });
  return { ...mod, calls };
}

const meeting = { venue: 'Café', localDate: '2030-01-02', localTime: '18:00', timeZone: 'Australia/Sydney', recurrence: 'weekly' };

test('v1 never asks for dating: discovery is platonic and invitations are platonic', async () => {
  const f = fixture();
  await f.api.discoverCandidates();
  await f.api.discoverCandidates({ cursor: 'uid-9' });
  await f.api.createInvitation({ toUid: 'bob', meeting }, 'key-1');
  assert.equal(JSON.stringify(f.calls[0]), JSON.stringify({ name: 'discoverCandidates', data: { mode: 'platonic', limit: 20 } }));
  assert.equal(f.calls[1].data.cursor, 'uid-9');
  assert.equal(f.calls[2].name, 'createInvitation');
  assert.equal(f.calls[2].data.intent, 'platonic');
  assert.equal(f.calls[2].data.requestKey, 'key-1');
  assert.equal(f.calls[2].data.meeting.recurrence, 'weekly');
});

test('idempotency keys are passed through unchanged on retries', async () => {
  let attempts = 0;
  const f = fixture(name => {
    if (name === 'sendMessage' && attempts++ === 0) throw Object.assign(new Error('timeout'), { code: 'functions/deadline-exceeded' });
    return { messageId: 'm', conversationId: 'c', created: attempts === 2 };
  });
  await assert.rejects(f.api.sendMessage('c', 'hola', 'client-1'), error => error.retryable === true);
  await f.api.sendMessage('c', 'hola', 'client-1');
  assert.deepEqual(f.calls.map(call => call.data.clientMessageId), ['client-1', 'client-1']);
});

test('failures become ApiError with code, reason and user copy', async () => {
  const f = fixture(() => { throw Object.assign(new Error('raw'), { code: 'functions/already-exists', details: { reason: 'invitation/duplicate-active' } }); });
  await assert.rejects(f.api.createInvitation({ toUid: 'bob', meeting }, 'k'), error => {
    assert.equal(error.name, 'ApiError');
    assert.equal(error.code, 'already-exists');
    assert.equal(error.reason, 'invitation/duplicate-active');
    assert.equal(error.retryable, false);
    assert.match(error.message, /Plans/);
    return true;
  });
});

test('deletion always sends the literal confirmation; other payloads match the contract', async () => {
  const f = fixture();
  await f.api.requestAccountDeletion();
  await f.api.respondToInvitation('inv_1', 'accept');
  await f.api.cancelInvitation('inv_2');
  await f.api.setBlock('bob', true);
  await f.api.reportUser({ reportedUid: 'bob', reason: 'spam', conversationId: 'c' });
  await f.api.markConversationRead('c');
  assert.equal(JSON.stringify(f.calls.map(call => [call.name, call.data])), JSON.stringify([
    ['requestAccountDeletion', { confirmation: 'DELETE' }],
    ['respondToInvitation', { invitationId: 'inv_1', action: 'accept' }],
    ['cancelInvitation', { invitationId: 'inv_2' }],
    ['setBlock', { otherUid: 'bob', blocked: true }],
    ['reportUser', { reportedUid: 'bob', reason: 'spam', conversationId: 'c' }],
    ['markConversationRead', { conversationId: 'c' }],
  ]));
  assert.equal(f.calls.some(call => call.name === 'setDatingConsent'), false);
});
