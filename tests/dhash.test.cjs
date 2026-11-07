const test = require('node:test');
const assert = require('node:assert/strict');
// The server's photo fingerprint (functions/lib), pure apart from JPEG decoding.
const {
  dhashFromPixels, dhashFromJpeg, hammingDistance, hashBands, isHash, isLowDetail, looksLikeJpeg,
} = require('../functions/lib/dhash.js');
const { DUPLICATE_PHOTO_DISTANCE } = require('../functions/lib/constants.js');

/** A deterministic 8 by 8 grid of grey blocks, `size` pixels square, as RGBA. */
function blocks(seed, size = 96, shift = 0) {
  let state = seed;
  const random = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
  const levels = Array.from({ length: 64 }, () => Math.floor(random() * 200) + 20);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const level = Math.min(255, levels[Math.floor((y * 8) / size) * 8 + Math.floor((x * 8) / size)] + shift);
      data.set([level, level, level, 255], (y * size + x) * 4);
    }
  }
  return { data, size };
}

const hashOf = ({ data, size }) => dhashFromPixels(data, size, size, 4);

test('a hash is 16 lower case hex characters, the same every time for the same picture', () => {
  const picture = blocks(7);
  const hash = hashOf(picture);
  assert.ok(isHash(hash), hash);
  assert.equal(hashOf(picture), hash);
  assert.equal(isHash('0123456789abcdeF'), false);
  assert.equal(isHash('0123'), false);
});

test('each bit says whether a pixel is brighter than its right hand neighbour', () => {
  const size = 18;
  const fading = new Uint8Array(size * size);
  const rising = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      fading[y * size + x] = 255 - x * 14;
      rising[y * size + x] = x * 14;
    }
  }
  assert.equal(dhashFromPixels(fading, size, size, 1), 'ffffffffffffffff');
  assert.equal(dhashFromPixels(rising, size, size, 1), '0000000000000000');
  assert.equal(dhashFromPixels(new Uint8Array(size * size).fill(90), size, size, 1), '0000000000000000');
});

test('grey, RGB and RGBA pixels of the same picture hash the same', () => {
  const { data, size } = blocks(3, 40);
  const grey = new Uint8Array(size * size);
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i += 1) {
    grey[i] = data[i * 4];
    rgb.set([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], i * 3);
  }
  const expected = dhashFromPixels(data, size, size, 4);
  assert.equal(dhashFromPixels(grey, size, size, 1), expected);
  assert.equal(dhashFromPixels(rgb, size, size, 3), expected);
});

test('the same picture resized or brightened stays within the duplicate distance; another picture does not', () => {
  const original = hashOf(blocks(11, 96));
  assert.ok(hammingDistance(original, hashOf(blocks(11, 160))) <= DUPLICATE_PHOTO_DISTANCE, 'resized');
  assert.ok(hammingDistance(original, hashOf(blocks(11, 96, 12))) <= DUPLICATE_PHOTO_DISTANCE, 'brighter');
  for (const seed of [12, 13, 14, 15]) {
    assert.ok(hammingDistance(original, hashOf(blocks(seed))) > DUPLICATE_PHOTO_DISTANCE, `seed ${seed}`);
  }
});

test('Hamming distance counts differing bits, and refuses anything that is not a hash', () => {
  assert.equal(hammingDistance('0000000000000000', '0000000000000000'), 0);
  assert.equal(hammingDistance('0000000000000000', 'ffffffffffffffff'), 64);
  assert.equal(hammingDistance('0000000000000000', '0000000000000001'), 1);
  assert.equal(hammingDistance('f0f0f0f0f0f0f0f0', '0f0f0f0f0f0f0f0f'), 64);
  assert.equal(hammingDistance('a5a5a5a5a5a5a5a5', 'a5a5a5a5a5a5a5a4'), 1);
  assert.throws(() => hammingDistance('xyz', '0000000000000000'));
});

test('bands are the eight rows, tagged, so any two hashes within 7 bits share one', () => {
  const hash = '0123456789abcdef';
  assert.deepEqual(hashBands(hash), ['0:01', '1:23', '2:45', '3:67', '4:89', '5:ab', '6:cd', '7:ef']);
  // Flip one bit in each of seven rows: distance 7, and the eighth row still matches.
  const chars = hash.split('');
  for (let row = 0; row < 7; row += 1) chars[row * 2] = (parseInt(chars[row * 2], 16) ^ 1).toString(16);
  const near = chars.join('');
  assert.equal(hammingDistance(hash, near), 7);
  const shared = hashBands(hash).filter(band => hashBands(near).includes(band));
  assert.deepEqual(shared, ['7:ef']);
  assert.throws(() => hashBands('nope'));
});

test('plain pictures are low detail and left out of duplicate matching', () => {
  assert.equal(isLowDetail('0000000000000000'), true);
  assert.equal(isLowDetail('ffffffffffffffff'), true);
  assert.equal(isLowDetail('0000000000000007'), true);
  assert.equal(isLowDetail(hashOf(blocks(5))), false);
  assert.equal(isLowDetail('not a hash'), true);
});

test('anything that is not a readable JPEG has no fingerprint, and never throws', () => {
  assert.equal(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
  assert.equal(dhashFromJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])), null);
  assert.equal(dhashFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), null);
  assert.equal(dhashFromJpeg(null), null);
  assert.throws(() => dhashFromPixels(new Uint8Array(3), 2, 2, 4), /shorter/);
  assert.throws(() => dhashFromPixels(new Uint8Array(16), 0, 2, 4), /positive/);
});
