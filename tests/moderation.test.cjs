const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const display = load('src/domain/display.ts', { './schedule': load('src/domain/schedule.ts') });
const {
  REPORT_STATUSES, statusLabel, describeReason, nextActions, summariseReport, partyName, actionLabel, actionConsequence, isDestructive, whenLabel,
} = load('src/domain/moderation.ts', { './display': display });

test('the created time reads as a day and a clock, and an absent time as nothing', () => {
  const now = new Date(2026, 9, 8, 9, 0);
  const sameDay = new Date(2026, 9, 8, 14, 5).toISOString();
  assert.equal(whenLabel(sameDay, now), 'Today, 14:05');
  const lastWeek = new Date(2026, 9, 1, 8, 7).toISOString();
  assert.equal(whenLabel(lastWeek, now), 'Thu 1 Oct, 08:07');
  assert.equal(whenLabel(null, now), '');
  assert.equal(whenLabel('not a date', now), '');
});

test('every report reason code has an operator facing label', () => {
  assert.equal(describeReason('harassment'), 'Harassment');
  assert.equal(describeReason('spam'), 'Spam');
  assert.equal(describeReason('inappropriate_content'), 'Inappropriate content');
  assert.equal(describeReason('impersonation'), 'Impersonation');
  assert.equal(describeReason('safety_concern'), 'Safety concern');
  assert.equal(describeReason('other'), 'Other');
  assert.equal(describeReason('something_new'), 'something_new');
});

test('the actions offered follow the report status', () => {
  assert.deepEqual([...nextActions('received')], ['claim', 'dismiss']);
  assert.deepEqual([...nextActions('reviewing')], ['warn', 'suspend', 'remove-photos', 'dismiss']);
  assert.deepEqual([...nextActions('actioned')], ['reinstate']);
  assert.deepEqual([...nextActions('dismissed')], []);
  assert.deepEqual([...nextActions('unknown')], []);
});

test('every status has a segment label', () => {
  assert.deepEqual([...REPORT_STATUSES].map(statusLabel), ['Received', 'Reviewing', 'Actioned', 'Dismissed']);
});

test('the queue line names both parties and the reason', () => {
  assert.equal(
    summariseReport({ reporterName: 'Aiko', reportedName: 'Ben', reason: 'harassment' }),
    'Harassment: Aiko reported Ben',
  );
});

test('a missing name says whether the account was deleted', () => {
  assert.equal(partyName('Aiko', true), 'Aiko');
  assert.equal(partyName(null, true), 'Deleted account');
  assert.equal(partyName(null, false), 'No profile');
  assert.equal(partyName(null, undefined), 'No profile');
  assert.equal(
    summariseReport({ reporterName: null, reporterDeleted: true, reportedName: null, reportedUserDeleted: false, reason: 'spam' }),
    'Spam: Deleted account reported No profile',
  );
});

test('every action has a label and a consequence from the contract', () => {
  const actions = ['claim', 'dismiss', 'warn', 'suspend', 'reinstate', 'remove-photos'];
  for (const action of actions) {
    assert.ok(actionLabel(action).length > 0, action);
    assert.ok(actionConsequence(action).length > 20, action);
  }
  assert.equal(actionLabel('remove-photos'), 'Remove photos');
  assert.match(actionConsequence('suspend'), /refresh tokens revoked/);
  assert.match(actionConsequence('suspend'), /Reversible with reinstate/);
  assert.match(actionConsequence('remove-photos'), /upload again/);
});

test('only suspend and remove photos are destructive', () => {
  assert.equal(isDestructive('suspend'), true);
  assert.equal(isDestructive('remove-photos'), true);
  assert.equal(isDestructive('claim'), false);
  assert.equal(isDestructive('dismiss'), false);
  assert.equal(isDestructive('warn'), false);
  assert.equal(isDestructive('reinstate'), false);
});
