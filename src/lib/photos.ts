/**
 * Profile photos on the device: pick → compress → upload → wait for screening → save.
 *
 * The pure rules (sizes, ids, paths, editor state, copy) live in src/domain/photos.ts.
 * This file is the platform glue: the photo library, the image manipulator, Storage and
 * the screening verdict in Firestore.
 *
 * Download URLs are resolved here, on the device, and held in memory only. They are never
 * written to Firestore or sent to the server; storage.rules decides whether a URL can be
 * issued at all (signed in, screened, and no block either way).
 */
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db, storage } from "./firebase";
import { api } from "./api";
import {
  MAX_UPLOAD_BYTES,
  PHOTO_EDGE,
  PHOTO_QUALITY,
  SCREENING_TIMEOUT_MS,
  photoPath,
  squareCrop,
  type PhotoProblem,
  type ScreeningStatus,
} from "../domain/photos";

export class PhotoError extends Error {
  readonly problem: PhotoProblem;
  constructor(problem: PhotoProblem) {
    super(problem);
    this.name = "PhotoError";
    this.problem = problem;
  }
}

export function problemOf(error: unknown): PhotoProblem {
  return error instanceof PhotoError ? error.problem : "upload";
}

export type PreparedPhoto = { uri: string; width: number; height: number };

/**
 * Opens the photo library (no camera) and returns a square JPEG of at most 1080px at
 * quality 0.8, or null if the person cancelled. The system picker needs no library
 * permission, so none is requested up front. Re-encoding writes a fresh JPEG from the
 * pixels, so metadata embedded in the original, such as location, is not carried over.
 */
export async function pickPhoto(): Promise<PreparedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  return compressPhoto(asset);
}

export async function compressPhoto(asset: { uri: string; width?: number; height?: number }): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.height) {
    const { crop, size } = squareCrop(asset.width, asset.height);
    context.crop(crop).resize({ width: size, height: size });
  } else {
    context.resize({ width: PHOTO_EDGE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Uploads to profilePhotos/{uid}/{photoId}.jpg, reporting progress from 0 to 1. */
export async function uploadPhoto(uid: string, photoId: string, uri: string, onProgress: (fraction: number) => void): Promise<void> {
  let blob: Blob;
  try {
    blob = await (await fetch(uri)).blob();
  } catch {
    throw new PhotoError("upload");
  }
  if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoError("too-large");

  const task = uploadBytesResumable(ref(storage, photoPath(uid, photoId)), blob, { contentType: "image/jpeg" });
  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      snap => onProgress(snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0),
      () => reject(new PhotoError("upload")),
      () => resolve(),
    );
  });
}

/**
 * Waits for the server's verdict in photoScreening/{uid}_{photoId}, which only the owner
 * can read. Resolves "timeout" if nothing arrives in time; the upload then stays unreadable
 * and unused, and the server cleans it up later.
 */
export function waitForScreening(uid: string, photoId: string, timeoutMs: number = SCREENING_TIMEOUT_MS): Promise<ScreeningStatus | "timeout"> {
  return new Promise(resolve => {
    let settled = false;
    let unsubscribe: Unsubscribe | null = null;
    const finish = (value: ScreeningStatus | "timeout") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(value);
    };
    const timer = setTimeout(() => finish("timeout"), timeoutMs);
    unsubscribe = onSnapshot(
      doc(db, "photoScreening", `${uid}_${photoId}`),
      snap => {
        const status = snap.exists() ? snap.get("status") : null;
        if (status === "approved" || status === "rejected" || status === "failed") finish(status);
      },
      () => finish("failed"),
    );
    if (settled) unsubscribe();
  });
}

/**
 * Upload, then wait for screening. Resolves once the photo is approved; throws a
 * PhotoError whose `problem` says what to tell the person otherwise.
 */
export async function uploadAndScreen(
  uid: string,
  photoId: string,
  uri: string,
  hooks: { onProgress: (fraction: number) => void; onChecking: () => void },
): Promise<void> {
  await uploadPhoto(uid, photoId, uri, hooks.onProgress);
  hooks.onChecking();
  const verdict = await waitForScreening(uid, photoId);
  if (verdict !== "approved") throw new PhotoError(verdict);
}

/** Saves the order and selection. The server re-checks ownership and screening. */
export function saveProfilePhotos(photoIds: string[]) {
  return api.setProfilePhotos(photoIds);
}

// ── Reading ─────────────────────────────────────────────────────────────────────────

const urls = new Map<string, Promise<string | null>>();

/**
 * A download URL for a stored photo, or null when the rules refuse it (blocked, still
 * being checked, removed) or it no longer exists. Failures are not cached, so a later
 * render can try again.
 */
export function photoUrl(path: string): Promise<string | null> {
  const known = urls.get(path);
  if (known) return known;
  const pending = getDownloadURL(ref(storage, path)).catch(() => {
    urls.delete(path);
    return null;
  });
  urls.set(path, pending);
  return pending;
}

/** Forget every resolved URL, for example on sign out. */
export function clearPhotoUrls() {
  urls.clear();
}
