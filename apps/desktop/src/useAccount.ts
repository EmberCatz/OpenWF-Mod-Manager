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
    const token = getApiKey();
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
