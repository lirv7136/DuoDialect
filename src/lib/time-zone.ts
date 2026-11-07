/**
 * The device's IANA time zone, which invitations state explicitly so the server can
 * resolve the wall time. Returns null if the JS engine cannot report one; callers then
 * refuse to send rather than guess a zone.
 */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}
