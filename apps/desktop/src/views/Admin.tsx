import { useEffect, useState } from "react";
import {
  banIp,
  banUser,
  deleteUserAdmin,
  dismissReport,
  fetchAdminReports,
  fetchAdminUsers,
  fetchBannedIps,
  fetchSiteSettings,
  killAllSessions,
  resolveReport,
  unbanIp,
  unbanUser,
  updateSiteSettings,
  type AdminReport,
  type AdminUser,
  type BannedIp,
  type SiteSettings,
} from "../api";
import { useAccount, useApiKey } from "../useAccount";
import { TrashIcon } from "../icons";
import { toast } from "../toast";
import { useStepUpReauth } from "../components/ReauthPrompt";

type Section = "users" | "reports" | "controls";
type ReportFilter = "open" | "resolved" | "dismissed" | "all";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "reports", label: "Reports" },
  { id: "controls", label: "Site Controls" },
];

// Gated on account.isAdmin at the App.tsx tab level, but every action here
// also 403s server-side regardless (see routes/admin.ts) — this view never
// has to be the only thing standing between a non-admin and these actions.
export default function Admin() {
  const apiKey = useApiKey();
  const { account } = useAccount();
  const [section, setSection] = useState<Section>("users");

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`settings-nav__item ${section === s.id ? "settings-nav__item--active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="settings-panel">
        {!apiKey ? (
          <p className="muted">Log in from Settings first.</p>
        ) : section === "users" ? (
          <UsersPanel apiKey={apiKey} selfId={account?.id} />
        ) : section === "reports" ? (
          <ReportsPanel apiKey={apiKey} />
        ) : (
          <SiteControlsPanel apiKey={apiKey} />
        )}
      </div>
    </div>
  );
}

function UsersPanel({ apiKey, selfId }: { apiKey: string; selfId?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const { requestToken, modal: reauthModal } = useStepUpReauth(apiKey);

  function load() {
    setLoading(true);
    fetchAdminUsers(apiKey)
      .then(setUsers)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [apiKey]);

  async function handleBanToggle(user: AdminUser) {
    setBusyId(user.id);
    try {
      if (user.isBanned) await unbanUser(user.id, apiKey);
      else await banUser(user.id, apiKey);
      setUsers((u) => u.map((x) => (x.id === user.id ? { ...x, isBanned: !x.isBanned } : x)));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(userId: string) {
    setBusyId(userId);
    try {
      const reauthToken = await requestToken();
      await deleteUserAdmin(userId, apiKey, reauthToken);
      setUsers((u) => u.filter((x) => x.id !== userId));
      setConfirmingDeleteId(null);
    } catch (e) {
      if (!(e instanceof Error && e.message === "cancelled")) toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p><span className="spinner" /> Loading users…</p>;

  return (
    <div>
      {reauthModal}
      {error && <p className="error">{error}</p>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Joined</th>
            <th>Mods</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const isSelf = user.id === selfId;
            return (
              <tr key={user.id}>
                <td>
                  {user.username}
                  {isSelf && <span className="muted"> (you)</span>}
                  {user.isAdmin && <span className="admin-badge admin-badge--admin">Admin</span>}
                </td>
                <td className="muted">{new Date(user.createdAt).toLocaleDateString()}</td>
                <td>{user.modCount}</td>
                <td>{user.isBanned && <span className="admin-badge admin-badge--banned">Banned</span>}</td>
                <td>
                  {!isSelf && (
                    <div className="field__row">
                      <button className="button" disabled={busyId === user.id} onClick={() => handleBanToggle(user)}>
                        {user.isBanned ? "Unban" : "Ban"}
                      </button>
                      {confirmingDeleteId === user.id ? (
                        <>
                          <button
                            className="button button--danger"
                            disabled={busyId === user.id}
                            onClick={() => handleDelete(user.id)}
                          >
                            Confirm
                          </button>
                          <button className="button" onClick={() => setConfirmingDeleteId(null)}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="button button--danger"
                          disabled={busyId === user.id || user.modCount > 0}
                          title={user.modCount > 0 ? "still owns mods — delete those first" : undefined}
                          onClick={() => setConfirmingDeleteId(user.id)}
                        >
                          <TrashIcon className="btn-icon" /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TOGGLES: { field: keyof SiteSettings; label: string; description: string }[] = [
  {
    field: "maintenanceMode",
    label: "Maintenance mode",
    description: "Blocks all API access for everyone except admins. Emergencies only — nobody can browse, log in (except you), upload, comment, or rate while this is on.",
  },
  {
    field: "uploadsDisabled",
    label: "Disable uploads",
    description: "Blocks new mod uploads and new version uploads for everyone except admins.",
  },
  {
    field: "signupsDisabled",
    label: "Disable new signups",
    description: "Blocks new account creation app-wide.",
  },
  {
    field: "commentsDisabled",
    label: "Disable comments & ratings",
    description: "Blocks new comments and star ratings app-wide.",
  },
];

function SiteControlsPanel({ apiKey }: { apiKey: string }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmingField, setConfirmingField] = useState<keyof SiteSettings | null>(null);
  const [confirmingKillSessions, setConfirmingKillSessions] = useState(false);

  const [bannedIps, setBannedIps] = useState<BannedIp[]>([]);
  const [ipsLoading, setIpsLoading] = useState(true);
  const [newIp, setNewIp] = useState("");
  const [newIpReason, setNewIpReason] = useState("");
  const { requestToken, modal: reauthModal } = useStepUpReauth(apiKey);

  useEffect(() => {
    fetchSiteSettings(apiKey)
      .then(setSettings)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => {
    fetchBannedIps(apiKey)
      .then(setBannedIps)
      .catch((e) => toast.error(String(e)))
      .finally(() => setIpsLoading(false));
  }, [apiKey]);

  async function applySetting(field: keyof SiteSettings, value: boolean) {
    setBusyKey(field);
    try {
      const reauthToken = await requestToken();
      const updated = await updateSiteSettings({ [field]: value }, apiKey, reauthToken);
      setSettings(updated);
      setConfirmingField(null);
    } catch (e) {
      if (!(e instanceof Error && e.message === "cancelled")) toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleKillSessions() {
    setBusyKey("kill-sessions");
    try {
      const reauthToken = await requestToken();
      const { killedCount } = await killAllSessions(apiKey, reauthToken);
      toast.success(`Logged out ${killedCount} session${killedCount === 1 ? "" : "s"}.`);
      setConfirmingKillSessions(false);
    } catch (e) {
      if (!(e instanceof Error && e.message === "cancelled")) toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleBanIp() {
    const ip = newIp.trim();
    if (!ip) return;
    setBusyKey("ban-ip");
    try {
      await banIp(ip, newIpReason.trim(), apiKey);
      setNewIp("");
      setNewIpReason("");
      setBannedIps(await fetchBannedIps(apiKey));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  async function handleUnbanIp(ip: string) {
    setBusyKey(`unban-${ip}`);
    try {
      await unbanIp(ip, apiKey);
      setBannedIps((ips) => ips.filter((x) => x.ip !== ip));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) return <p><span className="spinner" /> Loading site controls…</p>;
  if (error || !settings) return <p className="error">{error ?? "failed to load"}</p>;

  return (
    <div>
      {reauthModal}
      <h4 className="sidebar-section__title">Kill-switches</h4>
      <p className="hint">
        Each switch blocks the relevant action for everyone except admins. Turning one back off restores normal
        service immediately.
      </p>
      <ul className="site-control-list">
        {TOGGLES.map(({ field, label, description }) => {
          const active = settings[field];
          const busy = busyKey === field;
          return (
            <li key={field} className="site-control-row">
              <div>
                <strong>{label}</strong>
                {active && <span className="badge badge--installed">Active</span>}
                <p className="hint">{description}</p>
              </div>
              <div className="field__row">
                {active ? (
                  <button className="button" disabled={busy} onClick={() => applySetting(field, false)}>
                    {busy && <span className="spinner" />} Disable
                  </button>
                ) : confirmingField === field ? (
                  <>
                    <button className="button button--danger" disabled={busy} onClick={() => applySetting(field, true)}>
                      {busy && <span className="spinner" />} Confirm enable
                    </button>
                    <button className="button" onClick={() => setConfirmingField(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="button button--danger" onClick={() => setConfirmingField(field)}>
                    Enable
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <h4 className="sidebar-section__title site-control-section-title">Danger zone</h4>
      <ul className="site-control-list">
        <li className="site-control-row">
          <div>
            <strong>Kill all sessions</strong>
            <p className="hint">Force-logs-out every account immediately — for a suspected leaked-credential/compromise scenario.</p>
          </div>
          <div className="field__row">
            {confirmingKillSessions ? (
              <>
                <button className="button button--danger" disabled={busyKey === "kill-sessions"} onClick={handleKillSessions}>
                  {busyKey === "kill-sessions" && <span className="spinner" />} Confirm
                </button>
                <button className="button" onClick={() => setConfirmingKillSessions(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="button button--danger" onClick={() => setConfirmingKillSessions(true)}>
                <TrashIcon className="btn-icon" /> Kill all sessions
              </button>
            )}
          </div>
        </li>
      </ul>

      <h4 className="sidebar-section__title site-control-section-title">Banned IPs</h4>
      <p className="hint">
        Blocks an IP from the API entirely, regardless of account — catches abuse from anonymous/throwaway accounts a
        user ban can't touch (comments, ratings, reports have no account concept at all).
      </p>
      <div className="field__row">
        <input type="text" placeholder="IP address" value={newIp} onChange={(e) => setNewIp(e.target.value)} />
        <input type="text" placeholder="Reason (optional)" value={newIpReason} onChange={(e) => setNewIpReason(e.target.value)} />
        <button className="button button--danger" disabled={!newIp.trim() || busyKey === "ban-ip"} onClick={handleBanIp}>
          {busyKey === "ban-ip" && <span className="spinner" />} Ban IP
        </button>
      </div>
      {ipsLoading ? (
        <p>
          <span className="spinner" /> Loading banned IPs…
        </p>
      ) : bannedIps.length === 0 ? (
        <p className="muted">No IPs banned.</p>
      ) : (
        <table className="admin-table site-control-ip-table">
          <thead>
            <tr>
              <th>IP</th>
              <th>Reason</th>
              <th>Banned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bannedIps.map((b) => (
              <tr key={b.ip}>
                <td>{b.ip}</td>
                <td className="muted">{b.reason ?? "—"}</td>
                <td className="muted">{new Date(b.bannedAt).toLocaleDateString()}</td>
                <td>
                  <button className="button" disabled={busyKey === `unban-${b.ip}`} onClick={() => handleUnbanIp(b.ip)}>
                    Unban
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const REPORT_FILTERS: ReportFilter[] = ["open", "resolved", "dismissed", "all"];

function ReportsPanel({ apiKey }: { apiKey: string }) {
  const [filter, setFilter] = useState<ReportFilter>("open");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    fetchAdminReports(filter, apiKey)
      .then(setReports)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [apiKey, filter]);

  async function handleResolve(id: number) {
    setBusyId(id);
    try {
      await resolveReport(id, apiKey);
      setReports((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(id: number) {
    setBusyId(id);
    try {
      await dismissReport(id, apiKey);
      setReports((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="tabs tabs--sub">
        {REPORT_FILTERS.map((f) => (
          <button key={f} className={`tab ${filter === f ? "tab--active" : ""}`} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p><span className="spinner" /> Loading reports…</p>
      ) : reports.length === 0 ? (
        <p className="muted">No {filter === "all" ? "" : filter} reports.</p>
      ) : (
        <ul className="admin-reports">
          {reports.map((report) => (
            <li key={report.id} className="admin-report-card">
              <div className="admin-report-card__meta">
                <strong>{report.targetType}</strong> <span className="muted">#{report.targetId}</span>
                <span className="muted"> — {new Date(report.createdAt).toLocaleString()}</span>
              </div>
              <p>{report.reason}</p>
              {filter === "open" && (
                <div className="field__row">
                  <button className="button" disabled={busyId === report.id} onClick={() => handleResolve(report.id)}>
                    Resolve
                  </button>
                  <button className="button" disabled={busyId === report.id} onClick={() => handleDismiss(report.id)}>
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
