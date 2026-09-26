import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api, type AccountResult } from "../src/lib/api";
import { auth } from "../src/lib/firebase";
import { errorMessage } from "../src/domain/errors";

// The last result, per account, so returning to a screen does not flash a spinner.
let cached: { uid: string; value: AccountResult } | null = null;

export function rememberAccount(value: AccountResult) {
  const uid = auth.currentUser?.uid;
  if (uid) cached = { uid, value };
}

export function forgetAccount() {
  cached = null;
}

/** The caller's own profile via `getMyAccount`, refreshed whenever the screen gains focus. */
export function useMyAccount() {
  const uid = auth.currentUser?.uid ?? null;
  const initial = cached && cached.uid === uid ? cached.value : null;
  const [value, setValue] = useState<AccountResult | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!auth.currentUser) return;
    setError(null);
    try {
      const result = await api.getMyAccount();
      rememberAccount(result);
      setValue(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { profile: value?.profile ?? null, account: value?.account ?? null, loading, error, reload };
}
