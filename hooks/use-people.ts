import { useEffect, useRef, useState } from "react";
import { getPublicProfile } from "../src/lib/live";
import { sanitizePhotos, type ProfilePhoto } from "../src/domain/photos";

export type PersonSummary = { name: string; photos: ProfilePhoto[] };

const HIDDEN: PersonSummary = { name: "A member", photos: [] };

/**
 * Name and photos for each uid, read once per screen from the public profile. A profile
 * that is missing or hidden by a block reads as a neutral "A member" with no photo.
 */
export function usePeople(uids: string[]): Record<string, PersonSummary> {
  const [people, setPeople] = useState<Record<string, PersonSummary>>({});
  const requested = useRef(new Set<string>());
  const key = uids.join(",");

  useEffect(() => {
    for (const uid of key ? key.split(",") : []) {
      if (!uid || requested.current.has(uid)) continue;
      requested.current.add(uid);
      getPublicProfile(uid)
        .then(profile => setPeople(current => ({
          ...current,
          [uid]: profile ? { name: profile.displayName || HIDDEN.name, photos: sanitizePhotos(profile.photos) } : HIDDEN,
        })))
        .catch(() => setPeople(current => ({ ...current, [uid]: HIDDEN })));
    }
  }, [key]);

  return people;
}
