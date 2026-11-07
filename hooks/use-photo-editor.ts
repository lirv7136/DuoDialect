import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "../src/lib/firebase";
import { pickPhoto, problemOf, saveProfilePhotos, uploadAndScreen } from "../src/lib/photos";
import { errorMessage } from "../src/domain/errors";
import {
  addSlot,
  canAddPhoto,
  canBeMain,
  hasPendingPhotos,
  mainPhotoProblem,
  makeMain as moveToFront,
  newPhotoId,
  photoPath,
  photoProblemMessage,
  readyPhotoIds,
  removeSlot,
  sameIds,
  slotsFromPhotos,
  updateSlot,
  withMainFirst,
  type PhotoSlot,
  type ProfilePhoto,
} from "../src/domain/photos";

type Options = {
  /** The saved photos, or null until they have loaded. */
  initial: ProfilePhoto[] | null;
  /**
   * Save through setProfilePhotos after every change. Off during onboarding, where there
   * is no profile to attach photos to until the profile itself has been saved.
   */
  autoSave: boolean;
  onSaved?: (photos: ProfilePhoto[]) => void;
};

/**
 * State and actions for the profile photo row: add (pick → compress → upload → screening),
 * remove, and make main. Saves are serialised, and each one sends the latest order, so fast
 * taps cannot land out of order.
 *
 * The main photo must show one clear face. A photo screening found without one stays as an
 * extra; a face photo is kept in front, and nothing is saved while no photo can lead,
 * because the server would refuse it.
 */
export function usePhotoEditor({ initial, autoSave, onSaved }: Options) {
  const [slots, setSlots] = useState<PhotoSlot[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = useRef<PhotoSlot[]>([]);
  const committed = useRef<string[] | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const picking = useRef(false);

  useEffect(() => {
    if (initial === null || committed.current !== null) return;
    const loaded = slotsFromPhotos(initial);
    committed.current = readyPhotoIds(loaded);
    current.current = loaded;
    setSlots(loaded);
  }, [initial]);

  const persist = useCallback((): Promise<ProfilePhoto[] | null> => {
    const run = async () => {
      const ids = readyPhotoIds(current.current);
      if (committed.current && sameIds(ids, committed.current)) return null;
      if (mainPhotoProblem(current.current)) return null;
      setSaving(true);
      try {
        const result = await saveProfilePhotos(ids);
        committed.current = result.photos.map(photo => photo.id);
        onSaved?.(result.photos);
        return result.photos;
      } finally {
        setSaving(false);
      }
    };
    const next = queue.current.then(run);
    queue.current = next.then(() => undefined, () => undefined);
    return next;
  }, [onSaved]);

  const apply = useCallback((update: (value: PhotoSlot[]) => PhotoSlot[], save = false) => {
    current.current = update(current.current);
    setSlots(current.current);
    if (save && autoSave) {
      persist().catch(error => setNotice(errorMessage(error)));
    }
  }, [autoSave, persist]);

  const add = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || picking.current || !canAddPhoto(current.current)) return;
    setNotice(null);
    picking.current = true;
    let picked;
    try {
      picked = await pickPhoto();
    } catch (error) {
      setNotice(photoProblemMessage(problemOf(error)));
      return;
    } finally {
      picking.current = false;
    }
    if (!picked || !canAddPhoto(current.current)) return;

    const id = newPhotoId();
    apply(value => addSlot(value, { id, status: "uploading", progress: 0, localUri: picked.uri, path: null }));
    try {
      const { faceOk } = await uploadAndScreen(uid, id, picked.uri, {
        onProgress: progress => apply(value => updateSlot(value, id, { progress })),
        onChecking: () => apply(value => updateSlot(value, id, { status: "checking", progress: 1 })),
      });
      // Removed while it was being checked: leave it for the server to clean up.
      if (!current.current.some(slot => slot.id === id)) return;
      apply(value => withMainFirst(updateSlot(value, id, { status: "ready", path: photoPath(uid, id), faceOk })), true);
    } catch (error) {
      apply(value => removeSlot(value, id));
      setNotice(photoProblemMessage(problemOf(error)));
    }
  }, [apply]);

  const remove = useCallback((id: string) => { setNotice(null); apply(value => withMainFirst(removeSlot(value, id)), true); }, [apply]);
  const makeMain = useCallback((id: string) => {
    setNotice(null);
    apply(value => (canBeMain(value.find(slot => slot.id === id)) ? moveToFront(value, id) : value), true);
  }, [apply]);

  /** The photos were saved some other way (with the first profile save), so there is nothing to send. */
  const markSaved = useCallback((photos: ProfilePhoto[]) => {
    committed.current = photos.map(photo => photo.id);
  }, []);

  return {
    slots,
    notice,
    saving,
    canAdd: canAddPhoto(slots),
    pending: hasPendingPhotos(slots),
    /** Why the photos cannot be saved as they are (no face photo to lead with), or null. */
    mainProblem: mainPhotoProblem(slots),
    /** Screened photos in the order shown: what the first profile save attaches. */
    readyIds: readyPhotoIds(slots),
    add,
    remove,
    makeMain,
    markSaved,
    /** Saves the current selection now, whatever autoSave says. Resolves null if unchanged. */
    save: persist,
  };
}
