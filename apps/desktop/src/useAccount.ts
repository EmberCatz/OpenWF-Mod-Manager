import { useCallback, useEffect, useState } from "react";
import { fetchMe, type Account } from "./api";
import { getApiKey } from "./settings";

// Resolves the stored API key/session token to an Account (or null if
// there's none, or it's stale/invalid) — shared by App.tsx (to decide
// whether to show the Admin tab) and Settings.tsx (the Account section),
// so this fetch-on-mount logic only lives in one place.
export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  const refreshAccount = useCallback(async () => {
    const token = await getApiKey();
    if (!token) {
      setAccount(null);
      setAccountLoading(false);
      return;
    }
    setAccountLoading(true);
    try {
      setAccount(await fetchMe(token));
    } catch {
      setAccount(null); // stale/invalid token — just show the login form again
    } finally {
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  return { account, accountLoading, refreshAccount, setAccount };
}

// Resolves the raw stored API key/session token itself, for the couple of
// call sites (Admin, My Mods) that need the token directly to make authed
// requests rather than the Account it resolves to. Same fetch-on-mount
// shape as useAccount above — starts null, then flips to the real value
// (or stays null if logged out) once the keychain read resolves.
export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApiKey().then((key) => {
      if (!cancelled) setApiKeyState(key);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return apiKey;
}
