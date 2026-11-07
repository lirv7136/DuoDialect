"use strict";

/**
 * Photo fingerprints: a 64 bit difference hash (dHash).
 *
 * The picture is shrunk to 9 by 8 grey pixels and each bit records whether a pixel is
 * brighter than its right hand neighbour. Resizing, recompression and small colour changes
 * leave most bits alone, so the same photo uploaded to two accounts lands within a few
 * bits, while unrelated photos differ in about half of them. It is not robust to cropping
 * or mirroring, and is not meant to be: it catches the same picture reused, which is the
 * common shape of a fake account farm.
 *
 * The hash is 16 hex characters, one byte per row. Each row is also a "band" ("3:af"), so
 * Firestore can find candidates with array-contains-any; any two hashes within 7 bits of
 * each other share at least one band (pigeonhole: 8 bands), and the caller then checks the
 * real distance.
 *
 * Pure, except decodeJpeg, which loads jpeg-js (plain JavaScript, no native code) only
 * when it is called. tests/dhash.test.cjs covers the rest without it.
 */

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;
const HASH_PATTERN = /^[0-9a-f]{16}$/;

function assertImage(data, width, height, channels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("Image width and height must be positive whole numbers.");
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > 4) throw new Error("channels must be 1 to 4.");
  if (!data || typeof data.length !== "number" || data.length < width * height * channels) {
    throw new Error("Image data is shorter than width × height × channels.");
  }
}

/** Grey level per pixel, by the usual luma weights. */
function luminance(data, width, height, channels) {
  const grey = new Float64Array(width * height);
  for (let i = 0, p = 0; i < grey.length; i += 1, p += channels) {
    grey[i] = channels >= 3 ? 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2] : data[p];
  }
  return grey;
}

/** Box filter down to outWidth × outHeight: each output pixel is the mean of its area. */
function shrink(grey, width, height, outWidth, outHeight) {
  const out = new Float64Array(outWidth * outHeight);
  for (let oy = 0; oy < outHeight; oy += 1) {
    const y0 = Math.min(height - 1, Math.floor((oy * height) / outHeight));
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * height) / outHeight));
    for (let ox = 0; ox < outWidth; ox += 1) {
      const x0 = Math.min(width - 1, Math.floor((ox * width) / outWidth));
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * width) / outWidth));
      let sum = 0;
      for (let y = y0; y < y1; y += 1) {
        const row = y * width;
        for (let x = x0; x < x1; x += 1) sum += grey[row + x];
      }
      out[oy * outWidth + ox] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return out;
}

/**
 * The dHash of raw pixels: `data` holds width × height pixels of `channels` bytes each
 * (4 for RGBA, 3 for RGB, 1 for grey).
 */
function dhashFromPixels(data, width, height, channels = 4) {
  assertImage(data, width, height, channels);
  const small = shrink(luminance(data, width, height, channels), width, height, HASH_WIDTH, HASH_HEIGHT);
  let hex = "";
  for (let row = 0; row < HASH_HEIGHT; row += 1) {
    let byte = 0;
    for (let col = 0; col < HASH_WIDTH - 1; col += 1) {
      const index = row * HASH_WIDTH + col;
      byte = (byte << 1) | (small[index] > small[index + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function isHash(value) {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** How many of the 64 bits differ. */
function hammingDistance(a, b) {
  if (!isHash(a) || !isHash(b)) throw new Error("A dHash is 16 lower case hex characters.");
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) distance += NIBBLE_BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return distance;
}

function bitCount(hash) {
  let bits = 0;
  for (const char of hash) bits += NIBBLE_BITS[parseInt(char, 16)];
  return bits;
}

/**
 * A plain or nearly plain picture (a blank wall, a solid colour, a smooth gradient) hashes
 * to almost all zeros or all ones, so every such picture would "match" every other. Those
 * are left out of duplicate detection.
 */
function isLowDetail(hash) {
  if (!isHash(hash)) return true;
  const bits = bitCount(hash);
  return bits <= 3 || bits >= 61;
}

/** The 8 one byte bands, tagged with their row so "3:af" only matches row 3. */
function hashBands(hash) {
  if (!isHash(hash)) throw new Error("A dHash is 16 lower case hex characters.");
  const bands = [];
  for (let row = 0; row < HASH_HEIGHT; row += 1) bands.push(`${row}:${hash.slice(row * 2, row * 2 + 2)}`);
  return bands;
}

/** Bounds jpeg-js so a crafted file cannot exhaust the function's memory. */
const DECODE_LIMITS = { maxResolutionInMP: 40, maxMemoryUsageInMB: 256 };

function looksLikeJpeg(bytes) {
  return !!bytes && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** RGBA pixels of a JPEG. Throws on anything that is not a decodable JPEG. */
function decodeJpeg(bytes) {
  if (!looksLikeJpeg(bytes)) throw new Error("Not a JPEG.");
  const jpeg = require("jpeg-js");
  return jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, tolerantDecoding: true, ...DECODE_LIMITS });
}

/** The dHash of a JPEG file, or null when it cannot be decoded. Never throws. */
function dhashFromJpeg(bytes) {
  try {
    const image = decodeJpeg(bytes);
    return dhashFromPixels(image.data, image.width, image.height, 4);
  } catch {
    return null;
  }
}

module.exports = {
  dhashFromPixels,
  dhashFromJpeg,
  decodeJpeg,
  hammingDistance,
  hashBands,
  isHash,
  isLowDetail,
  looksLikeJpeg,
};
