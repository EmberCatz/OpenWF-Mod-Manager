# Mod Settings — File Format & Authoring Spec (Draft)

**Status: draft, not implemented.** This captures a design discussion about
letting players adjust a `.pluto` mod's exposed values (e.g. "how many
enemies does this spawn") from a new Mod Settings tab in the desktop app,
instead of editing the script's source. Deliberately queued behind other
work in [TODO.md](../TODO.md) — written now so the design isn't lost, not
as a build order. Treat everything here as provisional until it's actually
implemented and tested in-game.

## 1. The problem

Today, a `.pluto` mod that wants to be tunable hardcodes the value directly
in its own source (a constant, a magic number in a loop). Changing it means
editing the script file by hand. The goal is to let a player adjust
exposed values from the desktop app's UI without touching script source —
which means the app needs to write *something* the script reads, without
the app ever parsing or rewriting Pluto source itself (fragile, and a mod
update would silently wipe any hand-edited values living inside the
script file).

## 2. The shape of the solution

Two separate pieces, deliberately decoupled:

- **Schema** — what settings exist, their labels/types/defaults/limits.
  Declared once by the mod author, as upload metadata (not code).
- **Values** — the player's current choices. A small file the desktop app
  writes and the script reads. Never touched by a mod version update, so
  settings survive updates as long as the schema stays compatible.

The desktop app only ever touches the values file. It never inspects or
edits the `.pluto` source.

## 3. Precedent already in this codebase

This isn't a new idea for the Pluto side — `other_scripts/More Ephemera
Slots.pluto` already does exactly this, just author-only rather than
app-driven:

```pluto
local CONFIG_PATH = "OpenWF/Scripts/More Ephemera Slots.selection.txt"

local function read_selections()
    local values = {}
    local file = io.open(CONFIG_PATH, "r")
    if file then
        for line in file:lines() do
            table.insert(values, trim(line))
        end
        file:close()
    end
    return values
end

local function write_selections(values)
    local file = io.open(CONFIG_PATH, "w")
    if not file then return false end
    for i = 1, #values do
        if i > 1 then file:write("\n") end
        file:write(values[i] or "")
    end
    file:close()
    return true
end
```

(See [docs/pluto-scripting-guide.md §5.5](../../docs/pluto-scripting-guide.md)
for the full context — this is its "persisted-to-disk selection" example.)

This spec generalizes that exact pattern — same sibling-file convention,
same plain-text approach, same `io.open`/`:lines()` mechanics — just
keyed instead of positional, and written by an external tool instead of
the script's own in-game menu.

## 4. File naming & location

Matches the existing convention exactly: a values file sits **next to the
script**, in `OpenWF/Scripts/`, named `<script file name>.settings.txt`
(no separate subfolder — same pattern as `More Ephemera Slots.selection/
.items/.attachments.txt`).

```
OpenWF/Scripts/
  Swarm.pluto
  Swarm.settings.txt      <- written by the desktop app, read by the script
```

## 5. Values file format

### 5.1 Plain `key=value` lines (default, recommended)

No stdlib dependency beyond what `More Ephemera Slots.pluto` already uses
(`io.open`, `:lines()`, string matching). One setting per line:

```
# Swarm.settings.txt
enemy_count=12
clone_delay_ms=250
```

`#`-prefixed lines and blank lines are comments/ignored. Reading side,
generalizing the example's `read_selections()`:

```pluto
local SETTINGS_PATH = "OpenWF/Scripts/Swarm.settings.txt"

local DEFAULTS = {
    enemy_count = 6,
    clone_delay_ms = 500,
}

local function read_settings()
    local values = {}
    for k, v in DEFAULTS do values[k] = v end -- start from defaults

    local file = io.open(SETTINGS_PATH, "r")
    if file then
        for line in file:lines() do
            local key, raw = line:match("^%s*([%w_]+)%s*=%s*(.-)%s*$")
            if key and not line:match("^%s*#") then
                values[key] = tonumber(raw) or raw -- numeric if it parses, else string
            end
        end
        file:close()
    end
    return values
end

local settings = read_settings()
-- settings.enemy_count, settings.clone_delay_ms now available
```

This is a direct extension of the attested pattern above — nothing in it
is unverified beyond the regex/`tonumber` glue, which is plain Lua.

### 5.2 JSON (optional, for nested/typed data)

Pluto's stdlib has a `json` module (`local { json } = require "pluto:*"`,
per [pluto-lang.org's docs](https://pluto-lang.org/docs/Introduction) and
mentioned in
[pluto-scripting-guide.md §3.6](../../docs/pluto-scripting-guide.md)) —
worth using if a mod has many settings or nested values. **Unattested**:
no example script in this repo currently uses `json.decode`/`json.encode`,
so the exact calling convention should be flagged (`-- REVIEW`, per the
scripting guide's own convention) and confirmed in-game the first time a
mod actually relies on it.

## 6. Schema declaration

The schema (what settings exist, and how to render them) is **data
submitted at mod upload**, alongside the existing metadata fields
(changelog, gameVersions, tags) — not something parsed out of the `.pluto`
file. Proposed shape, one entry per setting:

```json
{
  "key": "enemy_count",
  "label": "Enemies spawned per clone wave",
  "type": "number",
  "default": 6,
  "min": 1,
  "max": 50,
  "step": 1
}
```

| Field | Meaning |
|---|---|
| `key` | Matches a key in the values file exactly. |
| `label` | Shown in the Mod Settings tab. |
| `type` | `number` \| `boolean` \| `enum` \| `string` — drives which control renders (slider/number box, checkbox, dropdown, text field). |
| `default` | Used if the key is missing from the values file (matches the script's own fallback default — should always match §5.1's `DEFAULTS` table). |
| `min`/`max`/`step` | `number` only. |
| `options` | `enum` only — the dropdown's choices. |

This mirrors the shape `Settings.pluto`'s in-game options screen already
uses informally (`{ label, getter, setter }` triples, checkbox vs. text
input decided by value type) — same idea, just declared as data for an
external tool instead of Lua table literals bound to live getters.

## 7. What a mod author actually has to do

Two things, both additive to however they already write the script:

1. Submit a settings schema (JSON, §6) at upload — a form in the Upload
   flow, not a file they hand-write.
2. Add a "read settings with fallback to defaults" block (§5.1) at the top
   of the script, and reference `settings.<key>` instead of a hardcoded
   literal everywhere that value is used.

Nothing else changes about how they write the rest of the script.

## 8. When do changes take effect?

**Default assumption: on the script's next start, not live.** The only
attested file-based-config example in this codebase
(`More Ephemera Slots.pluto`) reads its file once at script start and
only re-reads because *it* also owns the writing (via its own in-game
menu) — there's no existing example of a script noticing an *externally*
written change while already running. Don't assume live-reload works
until it's actually demonstrated.

If an author wants live-apply, that's on them to add (e.g. poll the file
periodically, or check on a fixed interval alongside other work) — not
something this convention guarantees by default. The safe fallback the
desktop app should offer either way: change the values file, then
stop+start the script (already-built `stop_script`/`start_script`
Command API calls, already wired into Dev Tools).

## 9. Desktop app side (not yet built)

- **Upload flow**: an optional settings-schema editor (add/remove rows:
  key, label, type, default, min/max or options) — stored as part of the
  mod's version metadata.
- **New "Mod Settings" tab**: for each installed mod with a declared
  schema, render controls pre-filled from the current values file (or
  schema defaults if the file/key is missing); on save, write the values
  file via the same local file I/O already used for install/uninstall
  (`native.ts`/`commands.rs`).
- **Apply**: a "Restart script" action reusing the existing
  `stop_script`/`start_script` calls, per §8.

## 10. Open questions before implementation

- JSON stdlib calling convention (§5.2) — unverified in-repo, confirm
  in-game before relying on it for anything beyond simple key=value.
- Whether a script *can* detect an external file change without a
  restart (mtime polling, etc.) — no existing example proves or disproves
  this; don't promise live-apply in the UI until tested.
- Multi-mod key collisions aren't a concern given the sibling-file naming
  (§4) — each mod's values file is already namespaced by its own script's
  filename, same as the existing `.selection.txt`/`.items.txt` pattern.
