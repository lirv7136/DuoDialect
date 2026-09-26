import { useEffect, useState } from "react";
import { photoUrl } from "../src/lib/photos";

/**
 * Resolves a stored photo path to a download URL, or null while loading, when there is no
 * path, or when the rules refuse it. The result is remembered per path for the session.
 */
export function usePhotoUrl(path: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    void photoUrl(path).then(url => { if (live) setResolved({ path, url }); });
    return () => { live = false; };
  }, [path]);

  return path && resolved?.path === path ? resolved.url : null;
}
