import { useEffect, useState } from "react";
import {
  banUser,
  deleteUserAdmin,
  dismissReport,
  fetchAdminReports,
  fetchAdminUsers,
  resolveReport,
  unbanUser,
  type AdminReport,
  type AdminUser,
} from "../api";
import { getApiKey } from "../settings";
import { useAccount } from "../useAccount";
import { TrashIcon } from "../icons";

type Section = "users" | "reports";
type ReportFilter = "open" | "resolved" | "dismissed" | "all";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "reports", label: "Reports" },
];

// Gated on account.isAdmin at the App.tsx tab level, but every action here
// also 403s server-side regardless (see routes/admin.ts) — this view never
// has to be the only thing standing between a non-admin and these actions.
export default function Admin() {
  const apiKey = getApiKey();
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
        ) : (
          <ReportsPanel apiKey={apiKey} />
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
    setError(null);
    try {
      if (user.isBanned) await unbanUser(user.id, apiKey);
      else await banUser(user.id, apiKey);
      setUsers((u) => u.map((x) => (x.id === user.id ? { ...x, isBanned: !x.isBanned } : x)));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      await deleteUserAdmin(userId, apiKey);
      setUsers((u) => u.filter((x) => x.id !== userId));
      setConfirmingDeleteId(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p><span className="spinner" /> Loading users…</p>;

  return (
    <div>
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
      setError(String(e));
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
      setError(String(e));
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
