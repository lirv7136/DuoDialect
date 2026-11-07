const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');
const idempotency = load('src/domain/idempotency.ts');
const p = load('src/domain/photos.ts', { './idempotency': idempotency });

const slot = (id, patch = {}) => ({ id, status: 'ready', progress: 1, localUri: null, path: `profilePhotos/u/${id}.jpg`, ...patch });
const ids = slots => slots.map(item => item.id).join(',');
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

test('photo ids and paths match what storage.rules and setProfilePhotos accept', () => {
  for (let i = 0; i < 200; i++) {
    const id = p.newPhotoId();
    assert.ok(p.isValidPhotoId(id), id);
    assert.equal(id.includes('_'), false, 'ids never contain the underscore the screening doc id reserves');
  }
  assert.equal(new Set(Array.from({ length: 300 }, () => p.newPhotoId())).size, 300);
  for (const bad of ['short', 'x'.repeat(65), 'has_underscore1', 'a/b/cdefgh', '../../etc1', '', null, 42]) {
    assert.equal(p.isValidPhotoId(bad), false, String(bad));
  }
  assert.equal(p.photoPath('uid1', 'abcdefgh1'), 'profilePhotos/uid1/abcdefgh1.jpg');
  assert.equal(p.MAX_PHOTOS, 3);
  assert.equal(p.MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
});

test('server photos are sanitised to at most three { id, path } entries', () => {
  const raw = [
    { id: 'aaaaaaaa1', path: 'profilePhotos/u/aaaaaaaa1.jpg', url: 'https://leak?token=1' },
    null, { id: 'bad id', path: 'x' }, { id: 'bbbbbbbb2' },
    { id: 'cccccccc3', path: 'p3' }, { id: 'dddddddd4', path: 'p4' }, { id: 'eeeeeeee5', path: 'p5' },
  ];
  const clean = p.sanitizePhotos(raw);
  same(clean.map(item => item.id), ['aaaaaaaa1', 'cccccccc3', 'dddddddd4']);
  assert.equal('url' in clean[0], false);
  same(p.sanitizePhotos(undefined), []);
  same(p.sanitizePhotos('nope'), []);
  assert.equal(p.mainPhotoPath(raw), 'profilePhotos/u/aaaaaaaa1.jpg');
  assert.equal(p.mainPhotoPath([]), null);
});

test('square crop is centred and resized to at most 1080px, never enlarged', () => {
  const wide = p.squareCrop(4032, 3024);
  same(wide.crop, { originX: 504, originY: 0, width: 3024, height: 3024 });
  assert.equal(wide.size, 1080);
  const tall = p.squareCrop(1200, 1600);
  same(tall.crop, { originX: 0, originY: 200, width: 1200, height: 1200 });
  const small = p.squareCrop(640, 480);
  assert.equal(small.size, 480);
  assert.equal(p.squareCrop(0, 0).crop.width, 1);
  assert.equal(p.PHOTO_EDGE, 1080);
  assert.equal(p.PHOTO_QUALITY, 0.8);
});

test('editor slots: add up to three, remove, make main, and only screened photos are saved', () => {
  let slots = p.slotsFromPhotos([{ id: 'aaaaaaaa1', path: 'pa' }, { id: 'bbbbbbbb2', path: 'pb' }]);
  assert.equal(slots[0].status, 'ready');
  assert.ok(p.canAddPhoto(slots));

  slots = p.addSlot(slots, slot('cccccccc3', { status: 'uploading', progress: 0, path: null, localUri: 'file:///c.jpg' }));
  assert.equal(slots.length, 3);
  assert.equal(p.canAddPhoto(slots), false);
  assert.equal(p.addSlot(slots, slot('dddddddd4')), slots, 'a fourth is refused');
  assert.equal(p.addSlot(p.removeSlot(slots, 'aaaaaaaa1'), slot('bbbbbbbb2')).length, 2, 'no duplicate ids');

  assert.ok(p.hasPendingPhotos(slots));
  assert.equal(p.readyPhotoIds(slots).join(','), 'aaaaaaaa1,bbbbbbbb2', 'photos still uploading are not saved');
  assert.equal(p.slotStatusLabel(p.updateSlot(slots, 'cccccccc3', { progress: 0.456 })[2]), 'Uploading 46%');
  slots = p.updateSlot(slots, 'cccccccc3', { status: 'checking', progress: 1 });
  assert.equal(p.slotStatusLabel(slots[2]), 'Checking photo…');
  slots = p.updateSlot(slots, 'cccccccc3', { status: 'ready' });
  assert.equal(p.slotStatusLabel(slots[2]), null);
  assert.equal(p.hasPendingPhotos(slots), false);

  slots = p.makeMain(slots, 'cccccccc3');
  assert.equal(ids(slots), 'cccccccc3,aaaaaaaa1,bbbbbbbb2');
  assert.equal(p.makeMain(slots, 'missing00'), slots);
  slots = p.removeSlot(slots, 'aaaaaaaa1');
  assert.equal(p.readyPhotoIds(slots).join(','), 'cccccccc3,bbbbbbbb2');

  assert.ok(p.sameIds(['a', 'b'], ['a', 'b']));
  assert.equal(p.sameIds(['a', 'b'], ['b', 'a']), false, 'order matters: the first is the main photo');
  assert.equal(p.sameIds(['a'], ['a', 'b']), false);
});

test('labels and messages: every image is named, and a rejection is kind', () => {
  assert.equal(p.photoLabel('Aiko', 0, 3), 'Aiko’s photo 1 of 3');
  assert.equal(p.photoLabel('', 1, 2), 'Member’s photo 2 of 2');
  assert.equal(p.initialsFor('Aiko'), 'A');
  assert.equal(p.initialsFor('  mary  jane smith '), 'MJ');
  assert.equal(p.initialsFor('Émile'), 'É');
  assert.equal(p.initialsFor(''), '?');

  const rejected = p.photoProblemMessage('rejected');
  assert.match(rejected, /can’t use that photo/);
  assert.doesNotMatch(rejected, /adult|violen|racy|explicit|inappropriate|nud/i, 'no accusatory detail');
  for (const problem of ['failed', 'timeout', 'too-large', 'upload']) {
    assert.ok(p.photoProblemMessage(problem).length > 10, problem);
    assert.notEqual(p.photoProblemMessage(problem), rejected);
  }
});

test('a screening verdict carries whether the photo may lead; an unchecked face counts as fine', () => {
  same(p.verdictFrom({ status: 'approved', face: { ok: true } }), { status: 'approved', faceOk: true });
  same(p.verdictFrom({ status: 'approved', face: { ok: false, problem: 'no-face' } }), { status: 'approved', faceOk: false });
  same(p.verdictFrom({ status: 'approved' }), { status: 'approved', faceOk: null });
  same(p.verdictFrom({ status: 'review', face: null }), { status: 'review', faceOk: null });
  assert.equal(p.verdictFrom({ status: 'pending' }), null, 'still waiting');
  assert.equal(p.verdictFrom(null), null);
});

test('the main photo must be a face photo: one is kept in front, and others stay as extras', () => {
  const face = slot('face00001', { faceOk: true });
  const legacy = slot('legacy001');
  const scenery = slot('scenery01', { faceOk: false });
  const checking = slot('checking1', { status: 'checking', faceOk: undefined });

  assert.equal(p.canBeMain(face), true);
  assert.equal(p.canBeMain(legacy), true, 'photos from before face checks still lead');
  assert.equal(p.canBeMain(scenery), false);
  assert.equal(p.canBeMain(checking), false, 'not until screened');
  assert.equal(p.canBeMain(undefined), false);

  assert.equal(ids(p.withMainFirst([scenery, face])), 'face00001,scenery01');
  assert.equal(ids(p.withMainFirst([face, scenery])), 'face00001,scenery01');
  assert.equal(ids(p.withMainFirst([scenery, checking])), 'scenery01,checking1', 'nothing qualifies yet, so nothing moves');
  assert.equal(ids(p.withMainFirst([])), '');

  assert.equal(p.mainPhotoProblem([face, scenery]), null);
  assert.equal(p.mainPhotoProblem([]), null, 'no photos is a different question');
  assert.equal(p.mainPhotoProblem([scenery]), p.MAIN_PHOTO_NEEDS_FACE);
  assert.equal(p.mainPhotoProblem([checking, scenery]), p.MAIN_PHOTO_NEEDS_FACE);
});

test('a new profile needs a screened face photo before the first save', () => {
  assert.equal(p.photoRequirementProblem([]), p.PHOTO_REQUIRED);
  assert.match(p.photoRequirementProblem([slot('checking1', { status: 'checking' })]), /still being checked/);
  assert.equal(p.photoRequirementProblem([slot('scenery01', { faceOk: false })]), p.MAIN_PHOTO_NEEDS_FACE);
  assert.equal(p.photoRequirementProblem([slot('face00001', { faceOk: true })]), null);
  assert.match(p.photoProblemMessage('review'), /check by our team/);
});
