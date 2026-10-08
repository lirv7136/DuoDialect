const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('./load-typescript.cjs')('src/domain/cancel-plan.ts');
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

test('the reasons are a fixed choice that matches the backend enum, with no free text', () => {
  same(c.CANCEL_REASONS.map(r => r.value), ['cant-make-it', 'reschedule', 'other']);
  for (const reason of c.CANCEL_REASONS) assert.ok(reason.label.length > 0 && reason.label.length <= 24, reason.value);
});

test('the reason phrase is what the other person reads, and "other" says nothing more', () => {
  assert.equal(c.cancelReasonPhrase('cant-make-it'), 'Can’t make it.');
  assert.equal(c.cancelReasonPhrase('reschedule'), 'Wants to reschedule.');
  assert.equal(c.cancelReasonPhrase('other'), '');
  assert.equal(c.cancelReasonPhrase(null), '');
  assert.equal(c.cancelReasonPhrase(undefined), '');
});

test('the confirm says the partner will be told, and that a weekly plan goes as a series', () => {
  same(c.cancelPlanConfirm('Aiko', false), {
    title: 'Cancel this plan?', body: 'Aiko will be told.', confirm: 'Cancel plan', cancel: 'Keep plan',
  });
  assert.equal(c.cancelPlanConfirm('Aiko', true).body, 'Aiko will be told. This cancels every week.');
  assert.equal(c.cancelPlanConfirm('', false).body, 'Your partner will be told.');
});

test('only a confirmed plan that one side cancelled counts as cancelled after accept', () => {
  assert.equal(c.wasCancelledAfterAccept({ status: 'cancelled', resolution: { by: 'a', reason: 'cancelled-after-accept' } }), true);
  assert.equal(c.wasCancelledAfterAccept({ status: 'cancelled', resolution: { by: 'a', reason: 'cancelled' } }), false);
  assert.equal(c.wasCancelledAfterAccept({ status: 'cancelled', resolution: { by: 'a', reason: 'blocked' } }), false);
  assert.equal(c.wasCancelledAfterAccept({ status: 'accepted', resolution: { by: 'a', reason: 'accepted' } }), false);
  assert.equal(c.wasCancelledAfterAccept({ status: 'cancelled', resolution: null }), false);
});
