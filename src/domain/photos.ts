/**
 * Profile photos: the pure parts of pick → compress → upload → screening → save.
 *
 * Mirrors the backend (functions/lib/photos.js, storage.rules): up to three photos, the
 * first is the main one, objects at profilePhotos/{uid}/{photoId}.jpg, JPEG at most 5 MB,
 * photo ids of 8 to 64 letters, digits or dashes. The profile stores only { id, path };
 * a download URL is resolved on the device and never saved anywhere.
 */
import { newIdempotencyKey, type RandomSource } from "./idempotency";

export const MAX_PHOTOS = 3;
/** Square edge, in pixels, that uploads are resized to (smaller images are not enlarged). */
export const PHOTO_EDGE = 1080;
export const PHOTO_QUALITY = 0.8;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** How long the app waits for the screening verdict before offering a retry. */
export const SCREENING_TIMEOUT_MS = 60_000;

const PHOTO_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export type ProfilePhoto = { id: string; path: string };

/** "review": the same picture is on another account, so a moderator looks before it is used. */
export type ScreeningStatus = "approved" | "rejected" | "failed" | "review";

/**
 * The server's verdict for one upload. `faceOk` says whether it may be the main photo
 * (exactly one clear face); null when the server did not check, which counts as fine.
 */
export type ScreeningVerdict = { status: ScreeningStatus; faceOk: boolean | null };

/** Reads a photoScreening document's fields into a verdict, or null while there is none. */
export function verdictFrom(data: { status?: unknown; face?: unknown } | null | undefined): ScreeningVerdict | null {
  const status = data?.status;
  if (status !== "approved" && status !== "rejected" && status !== "failed" && status !== "review") return null;
  const face = data?.face as { ok?: unknown } | null | undefined;
  return { status, faceOk: face && typeof face.ok === "boolean" ? face.ok : null };
}

export function isValidPhotoId(value: unknown): value is string {
  return typeof value === "string" && PHOTO_ID_PATTERN.test(value);
}

/** A new photo id. Base36 only, so it never contains the underscore the backend reserves. */
export function newPhotoId(random: RandomSource = Math.random, now: number = Date.now()): string {
  return newIdempotencyKey(random, now);
}

export function photoPath(uid: string, photoId: string): string {
  return `profilePhotos/${uid}/${photoId}.jpg`;
}

/** Keeps only well formed { id, path } entries, at most three, from whatever the server sent. */
export function sanitizePhotos(value: unknown): ProfilePhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ProfilePhoto => !!item && typeof item === "object"
      && isValidPhotoId((item as ProfilePhoto).id) && typeof (item as ProfilePhoto).path === "string")
    .slice(0, MAX_PHOTOS)
    .map(item => ({ id: item.id, path: item.path }));
}

/** The main photo's path, or null. */
export function mainPhotoPath(photos: unknown): string | null {
  return sanitizePhotos(photos)[0]?.path ?? null;
}

/**
 * A centred square crop, and the edge to resize it to. The picker's own editor may
 * already have cropped to a square; this also covers Android editors that ignore the
 * aspect and pickers with editing turned off.
 */
export function squareCrop(width: number, height: number, edge: number = PHOTO_EDGE) {
  const side = Math.max(1, Math.floor(Math.min(width, height)));
  return {
    crop: {
      originX: Math.max(0, Math.floor((width - side) / 2)),
      originY: Math.max(0, Math.floor((height - side) / 2)),
      width: side,
      height: side,
    },
    size: Math.min(side, edge),
  };
}

// ── Editor state ────────────────────────────────────────────────────────────────────

export type SlotStatus = "uploading" | "checking" | "ready";

/**
 * One photo in the editor. `ready` photos have passed screening and can be saved. A local
 * preview (`localUri`) is used for new uploads, because a photo cannot be read back from
 * Storage until it has passed its check.
 */
export type PhotoSlot = {
  id: string;
  status: SlotStatus;
  progress: number;
  localUri: string | null;
  path: string | null;
  /** False when screening found no single clear face: fine as an extra, never as the main photo. */
  faceOk?: boolean | null;
};

export function slotsFromPhotos(photos: unknown): PhotoSlot[] {
  return sanitizePhotos(photos).map(photo => ({ id: photo.id, status: "ready", progress: 1, localUri: null, path: photo.path }));
}

export function canAddPhoto(slots: PhotoSlot[]): boolean {
  return slots.length < MAX_PHOTOS;
}

export function addSlot(slots: PhotoSlot[], slot: PhotoSlot): PhotoSlot[] {
  if (!canAddPhoto(slots) || slots.some(item => item.id === slot.id)) return slots;
  return [...slots, slot];
}

export function updateSlot(slots: PhotoSlot[], id: string, patch: Partial<Omit<PhotoSlot, "id">>): PhotoSlot[] {
  return slots.map(slot => (slot.id === id ? { ...slot, ...patch } : slot));
}

export function removeSlot(slots: PhotoSlot[], id: string): PhotoSlot[] {
  return slots.filter(slot => slot.id !== id);
}

/** Moves a photo to the front, where it becomes the main photo. */
export function makeMain(slots: PhotoSlot[], id: string): PhotoSlot[] {
  const found = slots.find(slot => slot.id === id);
  if (!found) return slots;
  return [found, ...slots.filter(slot => slot.id !== id)];
}

/** The ids to send to setProfilePhotos: screened photos only, in the order shown. */
export function readyPhotoIds(slots: PhotoSlot[]): string[] {
  return slots.filter(slot => slot.status === "ready").map(slot => slot.id);
}

export function hasPendingPhotos(slots: PhotoSlot[]): boolean {
  return slots.some(slot => slot.status !== "ready");
}

/**
 * Whether a photo may be the main one: screened, and not found to lack one clear face.
 * Photos already on a profile carry no face result and count as fine, as the server does.
 */
export function canBeMain(slot: PhotoSlot | undefined): boolean {
  return !!slot && slot.status === "ready" && slot.faceOk !== false;
}

/**
 * Keeps a face photo in front: when the first photo cannot be the main one, the first that
 * can moves up. Nothing moves when the first is fine or no photo qualifies.
 */
export function withMainFirst(slots: PhotoSlot[]): PhotoSlot[] {
  if (slots.length === 0 || canBeMain(slots[0])) return slots;
  const index = slots.findIndex(slot => canBeMain(slot));
  return index > 0 ? makeMain(slots, slots[index].id) : slots;
}

export const MAIN_PHOTO_NEEDS_FACE = "Your main photo needs to show your face clearly, with no one else in it. Add one like that, and the others can stay as extras.";

/** Why the photos as they stand cannot be saved, or null when they can. */
export function mainPhotoProblem(slots: PhotoSlot[]): string | null {
  const ready = slots.filter(slot => slot.status === "ready");
  if (ready.length === 0) return null;
  return canBeMain(ready[0]) ? null : MAIN_PHOTO_NEEDS_FACE;
}

export const PHOTO_REQUIRED = "Add a clear photo of your face to finish. It’s how your partner will recognise you.";

/**
 * For a new profile, which must have a main photo: still checking, none yet, or no face
 * to lead with. Null when the photos are ready to go with the first save.
 */
export function photoRequirementProblem(slots: PhotoSlot[]): string | null {
  if (hasPendingPhotos(slots)) return "Your photo is still being checked. Wait a moment.";
  if (!slots.some(slot => slot.status === "ready")) return PHOTO_REQUIRED;
  return mainPhotoProblem(slots);
}

export function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function slotStatusLabel(slot: PhotoSlot): string | null {
  if (slot.status === "uploading") return `Uploading ${Math.round(Math.min(1, Math.max(0, slot.progress)) * 100)}%`;
  if (slot.status === "checking") return "Checking photo…";
  return null;
}

/** Said of a ready photo that cannot be the main one, so the screen can mark it. */
export const EXTRA_ONLY_LABEL = "Extra only";

// ── Copy ────────────────────────────────────────────────────────────────────────────

export type PhotoProblem = "rejected" | "failed" | "timeout" | "too-large" | "upload" | "review";

/** Kind, specific messages. A rejection never says why in detail, and never blames. */
export function photoProblemMessage(problem: PhotoProblem): string {
  switch (problem) {
    case "rejected":
      return "We can’t use that photo. Try a clear, everyday one of you.";
    case "failed":
      return "Couldn’t check it. Try again.";
    case "timeout":
      return "Still checking. Try again in a moment.";
    case "too-large":
      return "Too large. Pick another.";
    case "review":
      return "That photo needs a quick check by our team. If it’s fine, we’ll add it to your profile. Try a different one for now.";
    default:
      return "That photo didn’t upload. Check your connection and try again.";
  }
}

/** "Aiko’s photo 1 of 3". */
export function photoLabel(name: string, index: number, total: number): string {
  return `${name || "Member"}’s photo ${index + 1} of ${Math.max(total, index + 1)}`;
}

/** Up to two initials for the neutral no-photo avatar. */
export function initialsFor(name: string): string {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map(word => Array.from(word)[0]?.toLocaleUpperCase() ?? "");
  return letters.join("") || "?";
}
