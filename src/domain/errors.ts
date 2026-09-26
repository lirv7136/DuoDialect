/**
 * Maps callable failures to copy a person can act on.
 *
 * The backend attaches a stable `details.reason` to every deliberate rejection; branch
 * on that, never on message text. Plain validation failures arrive as
 * `invalid-argument` with a readable message and no reason, so that message is shown.
 * Dating reasons exist in the backend but v1 never calls a dating flow; they map to a
 * neutral message in case a stale server state produces one.
 */

export type CallableFailure = {
  code: string;
  reason: string | null;
  message: string;
};

const REASON_MESSAGES: Record<string, string> = {
  "account/not-adult": "This service is for adults aged 18 and over.",
  "account/suspended": "Your account is suspended. You can still delete it from Your profile.",
  "profile/incomplete": "Finish your profile first: a name, a language you speak fluently and one you are practising.",
  "profile/not-found": "This person no longer has a profile.",
  "target/self": "You can’t do that with your own profile.",
  "target/unavailable": "This person isn’t available.",
  "language/not-reciprocal": "Your languages no longer make a two-way exchange with this person.",
  "language/insufficient-fluency": "List at least one language you speak at native or fluent level.",
  "language/not-offered": "Those languages aren’t part of your exchange any more.",
  "language/offered-and-sought": "A language can’t be both one you offer and one you practise.",
  "invitation/duplicate-active": "You already have an open invitation with this person. Find it in Plans.",
  "invitation/not-pending": "This invitation has already been answered or cancelled.",
  "invitation/not-recipient": "Only the person invited can answer this invitation.",
  "invitation/not-sender": "Only the person who sent this invitation can cancel it.",
  "invitation/not-found": "This invitation no longer exists.",
  "conversation/not-found": "This conversation no longer exists.",
  "conversation/not-member": "You’re not part of this conversation.",
  "deletion/not-confirmed": "Type DELETE to confirm.",
};

const DATING_FALLBACK = "That isn’t available.";

const CODE_MESSAGES: Record<string, string> = {
  unauthenticated: "Your session has ended. Please log in again.",
  "permission-denied": "You don’t have permission to do that.",
  "not-found": "That no longer exists.",
  "already-exists": "That already exists.",
  "failed-precondition": "That can’t be done right now.",
  "resource-exhausted": "Too many attempts. Please wait a moment and try again.",
  unavailable: "We couldn’t reach the server. Check your connection and try again.",
  "deadline-exceeded": "The server took too long to respond. Please try again.",
  internal: "Something went wrong on our side. Please try again.",
};

const GENERIC = "Something went wrong. Please try again.";

/** Normalises anything thrown by httpsCallable (or elsewhere) into a failure record. */
export function toCallableFailure(error: unknown): CallableFailure {
  const value = (error && typeof error === "object" ? error : {}) as {
    code?: unknown; message?: unknown; details?: unknown;
  };
  const rawCode = typeof value.code === "string" ? value.code : "unknown";
  const code = rawCode.startsWith("functions/") ? rawCode.slice("functions/".length) : rawCode;
  const details = value.details && typeof value.details === "object" ? value.details as { reason?: unknown } : null;
  const reason = details && typeof details.reason === "string" ? details.reason : null;
  const message = typeof value.message === "string" ? value.message : "";
  return { code, reason, message };
}

/** Whether repeating the identical request (same idempotency key) is worth offering. */
export function isRetryable(failure: CallableFailure): boolean {
  return ["unavailable", "deadline-exceeded", "internal", "unknown", "resource-exhausted"].includes(failure.code) ||
    failure.code === "network-request-failed";
}

export function describeFailure(failure: CallableFailure): string {
  if (failure.reason) {
    if (REASON_MESSAGES[failure.reason]) return REASON_MESSAGES[failure.reason];
    if (failure.reason.startsWith("dating/")) return DATING_FALLBACK;
  }
  // Validation failures carry the server's own readable message and no reason code.
  if (failure.code === "invalid-argument" && failure.message) return failure.message;
  // Firebase Auth errors (for example during reauthentication).
  if (failure.code === "auth/wrong-password" || failure.code === "auth/invalid-credential") {
    return "That password isn’t right.";
  }
  if (failure.code === "auth/too-many-requests") return CODE_MESSAGES["resource-exhausted"];
  if (failure.code === "auth/network-request-failed") return CODE_MESSAGES.unavailable;
  if (failure.code === "auth/requires-recent-login") return "Please log in again, then retry.";
  return CODE_MESSAGES[failure.code] ?? GENERIC;
}

/** One call for screens: anything thrown, to a sentence. */
export function errorMessage(error: unknown): string {
  return describeFailure(toCallableFailure(error));
}

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don’t match. Try again or reset your password.",
  "auth/wrong-password": "That email and password don’t match. Try again or reset your password.",
  "auth/user-not-found": "That email and password don’t match. Try again or reset your password.",
  "auth/invalid-login-credentials": "That email and password don’t match. Try again or reset your password.",
  "auth/weak-password": "Choose a password with at least 6 characters.",
  "auth/email-already-in-use": "An account already uses that email. Log in, or reset your password.",
  "auth/invalid-email": "That doesn’t look like an email address. Check it and try again.",
  "auth/missing-email": "Enter your email address.",
  "auth/missing-password": "Enter your password.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, or reset your password.",
  "auth/network-request-failed": "We couldn’t reach the server. Check your connection and try again.",
  "auth/user-disabled": "This account has been disabled. Contact support if you think this is a mistake.",
};

/** Sign in, sign up and password reset: a Firebase Auth error, to a sentence. */
export function authErrorMessage(error: unknown): string {
  const { code } = toCallableFailure(error);
  return AUTH_MESSAGES[code] ?? GENERIC;
}
