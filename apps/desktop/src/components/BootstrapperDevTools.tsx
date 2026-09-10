import { useState } from "react";
import { bootstrapperRequest, type BootstrapperResult } from "../bootstrapperApi";

// Quick-action buttons for the OpenWF Bootstrapper's HTTP developer routes
// (docs/openwf-bootstrapper-manual.md § 2) — a faster path than typing
// URLs into a browser for the routes a modder actually reaches for while
// testing metadata patches or scripts. Only reachable while Warframe +
// Bootstrapper are running (same as the iframe below it).

interface QuickAction {
  id: string;
  label: string;
  path: string;
  hint?: string;
}

// Routes documented with no query argument. `pause_always_stops_time` and
// `apply_hotfix` are listed as bare routes in the manual with no worked
// example, so their exact behavior (report vs. toggle vs. apply) is
// inferred, not confirmed — flagged below rather than guessed silently.
const STATUS_ACTIONS: QuickAction[] = [
  { id: "ping", label: "Ping", path: "/ping" },
  { id: "status", label: "Status", path: "/status" },
  { id: "version", label: "Bootstrapper Version", path: "/version" },
  { id: "game_version", label: "Game Version", path: "/game_version" },
  { id: "memory", label: "Memory", path: "/memory" },
  { id: "server_host", label: "Server Host", path: "/server_host" },
];

const METADATA_ACTIONS: QuickAction[] = [
  {
    id: "save_all_metadata",
    label: "Save All Metadata",
    path: "/save_all_metadata",
    hint: "Creates an empty patch on every metadata read from now on, so it shows up in a lookup below. May degrade performance — the manual warns about this.",
  },
  { id: "write_all_console", label: "Write All Reads → Console", path: "/write_all_metadata_reads_to_console" },
  { id: "write_all_eelog", label: "Write All Reads → EE.log", path: "/write_all_metadata_reads_to_ee_log" },
  { id: "write_patched_console", label: "Write Patched Reads → Console", path: "/write_patched_metadata_reads_to_console" },
  { id: "write_patched_eelog", label: "Write Patched Reads → EE.log", path: "/write_patched_metadata_reads_to_ee_log" },
];

const SCRIPT_LIST_ACTIONS: QuickAction[] = [
  { id: "scripts", label: "List Scripts", path: "/scripts" },
  { id: "autostart_scripts", label: "List Autostart Scripts", path: "/autostart_scripts" },
];

const MISC_ACTIONS: QuickAction[] = [
  { id: "toggle_console", label: "Toggle Console", path: "/toggle_console" },
  {
    id: "apply_hotfix",
    label: "Apply Hotfix",
    path: "/apply_hotfix",
    hint: "Exact effect unconfirmed — the manual lists this route but doesn't show a worked example.",
  },
  {
    id: "pause_always_stops_time",
    label: "Pause Always Stops Time",
    path: "/pause_always_stops_time",
    hint: "Exact effect unconfirmed — the manual documents enable_/disable_pause_always_stops_time as separate Command API actions, so this bare route's behavior (report vs. toggle) isn't shown by example.",
  },
];

export default function BootstrapperDevTools() {
  const [result, setResult] = useState<{ label: string; res: BootstrapperResult } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [metadataPath, setMetadataPath] = useState("");
  const [scriptName, setScriptName] = useState("");

  async function run(id: string, label: string, path: string, query?: string) {
    setBusyId(id);
    try {
      const res = await bootstrapperRequest(path, query);
      setResult({ label, res });
    } catch (e) {
      setResult({ label, res: { ok: false, status: 0, body: String(e) } });
    } finally {
      setBusyId(null);
    }
  }

  function renderGroup(title: string, actions: QuickAction[]) {
    const hints = actions.filter((a): a is QuickAction & { hint: string } => !!a.hint);
    return (
      <div className="dev-tools-group">
        <h4 className="sidebar-section__title">{title}</h4>
        <div className="dev-tools-group__buttons">
          {actions.map((a) => (
            <button
              key={a.id}
              className="button"
              disabled={busyId === a.id}
              title={a.hint}
              onClick={() => run(a.id, a.label, a.path)}
            >
              {busyId === a.id ? "…" : a.label}
            </button>
          ))}
        </div>
        {hints.length > 0 && (
          <ul className="dev-tools-group__hints">
            {hints.map((a) => (
              <li key={a.id}>
                <strong>{a.label}:</strong> {a.hint}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="dev-tools">
      <div className="dev-tools-warning">
        <strong>Careful with these.</strong> These are the Bootstrapper's own raw developer routes, not
        beginner-friendly toggles — some change live script/autostart state, one ("Save All Metadata") can degrade
        performance, and a couple of routes have effects that aren't fully confirmed (flagged below their group).
        Don't click something here you don't recognize. Full documentation:{" "}
        <span className="dev-tools-warning__link">https://about.openwf.io/bootstrapper-manual</span>
      </div>

      {renderGroup("Status", STATUS_ACTIONS)}
      {renderGroup("Metadata Patch Debugging", METADATA_ACTIONS)}

      <div className="dev-tools-group">
        <h4 className="sidebar-section__title">Metadata Lookup</h4>
        <p className="hint">
          Internal path of an item the game has already loaded this session (open its menu/Arsenal entry first) —
          see docs/metadata-patching-guide.md.
        </p>
        <div className="field__row">
          <input
            type="text"
            placeholder="/Lotus/Upgrades/Mods/Warframe/AvatarHealthMaxMod"
            value={metadataPath}
            onChange={(e) => setMetadataPath(e.target.value)}
          />
          <button
            className="button"
            disabled={!metadataPath || busyId === "get_effective_metadata"}
            onClick={() => run("get_effective_metadata", `Metadata: ${metadataPath}`, "/get_effective_metadata", metadataPath)}
          >
            Get
          </button>
          <button
            className="button"
            disabled={!metadataPath || busyId === "get_effective_metadata_as_json"}
            onClick={() =>
              run("get_effective_metadata_as_json", `Metadata (JSON): ${metadataPath}`, "/get_effective_metadata_as_json", metadataPath)
            }
          >
            Get as JSON
          </button>
        </div>
      </div>

      {renderGroup("Scripts", SCRIPT_LIST_ACTIONS)}

      <div className="dev-tools-group">
        <h4 className="sidebar-section__title">Script Control</h4>
        <p className="hint">Exact query format for these three is inferred from the manual's bare-value convention, not shown by example.</p>
        <div className="field__row">
          <input type="text" placeholder="Script name" value={scriptName} onChange={(e) => setScriptName(e.target.value)} />
          <button
            className="button"
            disabled={!scriptName || busyId === "start_script"}
            onClick={() => run("start_script", `Start Script: ${scriptName}`, "/start_script", scriptName)}
          >
            Start
          </button>
          <button
            className="button"
            disabled={!scriptName || busyId === "add_autostart_script"}
            onClick={() => run("add_autostart_script", `Add Autostart: ${scriptName}`, "/add_autostart_script", scriptName)}
          >
            Add Autostart
          </button>
          <button
            className="button"
            disabled={!scriptName || busyId === "remove_autostart_script"}
            onClick={() => run("remove_autostart_script", `Remove Autostart: ${scriptName}`, "/remove_autostart_script", scriptName)}
          >
            Remove Autostart
          </button>
        </div>
      </div>

      {renderGroup("Misc", MISC_ACTIONS)}

      {result && (
        <div className="dev-tools-result">
          <div className="dev-tools-result__header">
            <strong>{result.label}</strong>
            <span className={result.res.ok ? "muted" : "error"}>
              {result.res.status === 0 ? "request failed" : `HTTP ${result.res.status}`}
            </span>
          </div>
          <pre className="dev-tools-result__body">{result.res.body || "(empty response)"}</pre>
        </div>
      )}
    </div>
  );
}
