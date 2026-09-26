const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const { notificationTarget } = load('src/domain/notification-target.ts');
// The loader runs modules in another context, so compare structure rather than prototypes.
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

test('a message notification opens its conversation', () => {
  same(notificationTarget({ type: 'message', conversationId: 'conv_1', otherUid: 'u2' }),
    { pathname: '/chat/[chatId]', params: { chatId: 'conv_1', otherUid: 'u2' } });
  // Older builds' notifications carried no type.
  same(notificationTarget({ conversationId: 'conv_1' }), { pathname: '/chat/[chatId]', params: { chatId: 'conv_1' } });
});

test('a new invitation opens Plans; an accepted one opens the chat', () => {
  assert.equal(notificationTarget({ type: 'plan', invitationId: 'inv_1', conversationId: null }), '/(tabs)/plans');
  same(notificationTarget({ type: 'plan', conversationId: 'conv_9', otherUid: 'u3' }),
    { pathname: '/chat/[chatId]', params: { chatId: 'conv_9', otherUid: 'u3' } });
});

test('anything else is ignored', () => {
  for (const data of [null, undefined, 'x', {}, { type: 'marketing' }, { conversationId: 3 }]) {
    assert.equal(notificationTarget(data), null);
  }
});
