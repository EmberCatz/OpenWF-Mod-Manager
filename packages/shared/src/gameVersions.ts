// Hardcoded game-version compatibility tags, sourced from
// https://about.openwf.io/versions. Regenerate with `npm run scrape:versions`
// (packages/shared/scripts/scrape-game-versions.mjs) rather than editing by
// hand — a scheduled GitHub Actions workflow also runs it weekly and opens a
// PR if the site has new versions (see .github/workflows/scrape-game-versions.yml).
// Every distinct version number on that page is included (not just major
// update names) since patch-level compatibility genuinely matters for
// metadata patches / scripts that touch specific client data.
//
// "all" is a sentinel, not a real version: a mod tagged with it is claimed
// compatible with every version, mutually exclusive with picking specific
// ones (see Upload.tsx).

export const ALL_VERSIONS_TAG = "all";

// Every version number, newest first. What gets validated against
// server-side and what a mod's compatibility tags are drawn from.
export const GAME_VERSIONS: string[] = [
  "42.0.11",
  "42.0.10",
  "42.0.9",
  "42.0.8",
  "42.0.7",
  "42.0.6.1",
  "42.0.6",
  "42.0.5",
  "42.0.4.1",
  "42.0.4",
  "42.0.3",
  "42.0.2",
  "42.0.1.1",
  "42.0.1",
  "42.0.0",
  "41.1.2",
  "41.1.1",
  "41.1.0",
  "41.0.7",
  "41.0.6",
  "41.0.5",
  "41.0.4",
  "41.0.3",
  "41.0.2",
  "41.0.1",
  "41.0.0",
  "40.0.5.1",
  "40.0.5",
  "40.0.4",
  "40.0.3",
  "40.0.2",
  "40.0.1",
  "40.0.0",
  "39.1.3",
  "39.1.2",
  "39.1.0",
  "39.0.7",
  "38.6.3",
  "38.5.11",
  "38.5.5",
  "38.0.12",
  "38.0.11",
  "38.0.7",
  "37.0.6",
  "36.1.6.1",
  "36.1.2",
  "36.0.7",
  "36.0.4",
  "35.5.0",
  "35.1.2",
  "35.1.0",
  "35.0.11",
  "35.0.6",
  "34.0.8",
  "33.6.9",
  "33.6.0",
  "33.5.6",
  "33.5.2",
  "33.5.0",
  "33.0.14",
  "33.0.10",
  "33.0.0",
  "32.3.7",
  "32.3.0",
  "32.2.0",
  "32.0.0",
  "31.7.1",
  "31.6.0",
  "31.5.0",
  "31.1.0",
  "31.0.5",
  "31.0.0",
  "30.7.2",
  "30.7.1",
  "30.5.0",
  "30.3.4",
  "30.3.0",
  "30.0.8.1",
  "30.0.0",
  "29.10.0",
  "29.6.8",
  "29.5.0",
  "29.3.1",
  "29.0.0",
  "28.3.0",
  "28.0.0",
  "27.3.0",
  "27.2.0",
  "27.0.0",
  "26.1.3",
  "26.1.0",
  "26.0.4",
  "26.0.0",
  "25.7.5",
  "25.7.0",
  "25.0.0",
  "24.6.0",
  "24.5.1",
  "24.4.1",
  "24.4.0",
  "24.1.2",
  "24.0.8",
  "24.0.0",
  "23.10.0",
  "23.9.1",
  "23.2.0",
  "23.0.0",
  "22.20.0",
  "22.18.0",
  "22.16.0",
  "22.15.0",
  "22.13.4",
  "22.8.2",
  "22.7.0",
  "22.2.4",
  "22.0.0",
  "21.2.0",
  "21.0.1",
  "21.0.0",
  "20.4.0",
  "20.0.3",
  "19.13.0",
  "19.5.3",
  "19.5.0",
  "19.4.1",
  "19.0.3",
  "19.0.1",
  "18.22.1",
  "18.21.3",
  "18.19.3",
  "18.18.5",
  "18.18.0",
  "18.5.0",
  "18.4.13",
  "18.0.6",
  "17.8.1",
  "17.8.0",
  "17.7.1",
  "17.2.6",
  "16.11.5",
  "16.5.5",
  "16.5.0",
  "16.4.0",
  "16.3.2",
  "16.2.0",
  "16.1.6",
  "16.1.5",
  "16.1.4.1",
  "16.1.3",
  "16.0.2",
  "15.14.1",
  "15.5.0",
  "15.0.8",
  "15.0.7",
  "15.0.6",
  "15.0.0",
  "14.5.0",
  "14.0.0",
  "13.4.1",
  "13.4.0",
  "13.1.1",
  "13.0.4",
  "13.0.0",
  "12.5.2",
  "12.1.2",
  "10.8.0",
  "10.3.3",
  "9.1.0",
  "8.3.0",
  "8.0.0",
  "7.10.2",
  "7.10.1",
  "7.10.0",
  "7.9.0",
  "7.8.1",
  "7.8.0",
  "7.7.4",
  "7.7.3",
  "7.7.2",
  "7.7.1",
  "7.7.0",
  "7.6.0",
  "7.5.1",
  "7.4.1",
  "7.4.0",
  "7.3.0",
  "5.2.0",
  "5.1.0"
];

// The same versions grouped by their major update name, newest first —
// lets the upload UI offer "select this whole update" as a shortcut
// instead of checking dozens of individual patch numbers by hand.
export interface GameVersionGroup {
  title: string;
  versions: string[];
}

export const GAME_VERSION_GROUPS: GameVersionGroup[] = [
  {
    "title": "The Shadowgrapher",
    "versions": [
      "42.0.11",
      "42.0.10",
      "42.0.9",
      "42.0.8",
      "42.0.7",
      "42.0.6.1",
      "42.0.6",
      "42.0.5",
      "42.0.4.1",
      "42.0.4",
      "42.0.3",
      "42.0.2",
      "42.0.1.1",
      "42.0.1",
      "42.0.0"
    ]
  },
  {
    "title": "Vauban Heirloom",
    "versions": [
      "41.1.2",
      "41.1.1",
      "41.1.0"
    ]
  },
  {
    "title": "The Old Peace",
    "versions": [
      "41.0.7",
      "41.0.6",
      "41.0.5",
      "41.0.4",
      "41.0.3",
      "41.0.2",
      "41.0.1",
      "41.0.0"
    ]
  },
  {
    "title": "The Vallis Undermind",
    "versions": [
      "40.0.5.1",
      "40.0.5",
      "40.0.4",
      "40.0.3",
      "40.0.2",
      "40.0.1",
      "40.0.0"
    ]
  },
  {
    "title": "Caliban Prime",
    "versions": [
      "39.1.3",
      "39.1.2",
      "39.1.0"
    ]
  },
  {
    "title": "Isleweaver",
    "versions": [
      "39.0.7"
    ]
  },
  {
    "title": "Yareli Prime",
    "versions": [
      "38.6.3"
    ]
  },
  {
    "title": "Techrot Encore",
    "versions": [
      "38.5.11",
      "38.5.5"
    ]
  },
  {
    "title": "1999",
    "versions": [
      "38.0.12",
      "38.0.11",
      "38.0.7"
    ]
  },
  {
    "title": "Koumei & the Five Fates",
    "versions": [
      "37.0.6"
    ]
  },
  {
    "title": "The Lotus Eaters",
    "versions": [
      "36.1.6.1",
      "36.1.2"
    ]
  },
  {
    "title": "Jade Shadows",
    "versions": [
      "36.0.7",
      "36.0.4"
    ]
  },
  {
    "title": "Dante Unbound",
    "versions": [
      "35.5.0"
    ]
  },
  {
    "title": "Whispers in the Walls",
    "versions": [
      "35.1.2",
      "35.1.0",
      "35.0.11",
      "35.0.6"
    ]
  },
  {
    "title": "Abyss of Dagath",
    "versions": [
      "34.0.8"
    ]
  },
  {
    "title": "Echoes of Duviri",
    "versions": [
      "33.6.9",
      "33.6.0"
    ]
  },
  {
    "title": "The Seven Crimes of Kullervo",
    "versions": [
      "33.5.6",
      "33.5.2",
      "33.5.0"
    ]
  },
  {
    "title": "The Duviri Paradox",
    "versions": [
      "33.0.14",
      "33.0.10",
      "33.0.0"
    ]
  },
  {
    "title": "Citrine's Last Wish",
    "versions": [
      "32.3.7",
      "32.3.0"
    ]
  },
  {
    "title": "Lua's Prey",
    "versions": [
      "32.2.0"
    ]
  },
  {
    "title": "Veilbreaker",
    "versions": [
      "32.0.0"
    ]
  },
  {
    "title": "Echoes of the Zariman",
    "versions": [
      "31.7.1",
      "31.6.0"
    ]
  },
  {
    "title": "Angels of the Zariman",
    "versions": [
      "31.5.0"
    ]
  },
  {
    "title": "The New War",
    "versions": [
      "31.1.0",
      "31.0.5",
      "31.0.0"
    ]
  },
  {
    "title": "Sisters of Parvos",
    "versions": [
      "30.7.2",
      "30.7.1",
      "30.5.0"
    ]
  },
  {
    "title": "Call of the Tempestarii",
    "versions": [
      "30.3.4",
      "30.3.0",
      "30.0.8.1",
      "30.0.0"
    ]
  },
  {
    "title": "Orphix Venom",
    "versions": [
      "29.10.0",
      "29.6.8"
    ]
  },
  {
    "title": "Echoes of Deimos",
    "versions": [
      "29.5.0"
    ]
  },
  {
    "title": "Heart of Deimos",
    "versions": [
      "29.3.1",
      "29.0.0"
    ]
  },
  {
    "title": "Derelict Shift",
    "versions": [
      "28.3.0"
    ]
  },
  {
    "title": "The Deadlock Protocol",
    "versions": [
      "28.0.0"
    ]
  },
  {
    "title": "Empyrean",
    "versions": [
      "27.3.0",
      "27.2.0",
      "27.0.0"
    ]
  },
  {
    "title": "Rising Tide",
    "versions": [
      "26.1.3",
      "26.1.0"
    ]
  },
  {
    "title": "The Old Blood",
    "versions": [
      "26.0.4",
      "26.0.0"
    ]
  },
  {
    "title": "Saint of Altra",
    "versions": [
      "25.7.5",
      "25.7.0"
    ]
  },
  {
    "title": "The Jovian Concord",
    "versions": [
      "25.0.0"
    ]
  },
  {
    "title": "Buried Debts",
    "versions": [
      "24.6.0",
      "24.5.1",
      "24.4.1"
    ]
  },
  {
    "title": "Fortuna",
    "versions": [
      "24.4.0",
      "24.1.2",
      "24.0.8",
      "24.0.0"
    ]
  },
  {
    "title": "Chimera",
    "versions": [
      "23.10.0"
    ]
  },
  {
    "title": "Mask of the Revenant",
    "versions": [
      "23.9.1"
    ]
  },
  {
    "title": "The Sacrifice",
    "versions": [
      "23.2.0",
      "23.0.0"
    ]
  },
  {
    "title": "Beasts of the Sanctuary",
    "versions": [
      "22.20.0",
      "22.18.0"
    ]
  },
  {
    "title": "Plains of Eidolon",
    "versions": [
      "22.16.0",
      "22.15.0",
      "22.13.4",
      "22.8.2",
      "22.7.0",
      "22.2.4",
      "22.0.0"
    ]
  },
  {
    "title": "Chains of Harrow",
    "versions": [
      "21.2.0",
      "21.0.1",
      "21.0.0"
    ]
  },
  {
    "title": "Octavia's Anthem",
    "versions": [
      "20.4.0",
      "20.0.3"
    ]
  },
  {
    "title": "The Glast Gambit",
    "versions": [
      "19.13.0",
      "19.5.3",
      "19.5.0"
    ]
  },
  {
    "title": "The War Within",
    "versions": [
      "19.4.1",
      "19.0.3",
      "19.0.1"
    ]
  },
  {
    "title": "The Silver Grove",
    "versions": [
      "18.22.1",
      "18.21.3",
      "18.19.3",
      "18.18.5",
      "18.18.0"
    ]
  },
  {
    "title": "Sands of Inaros",
    "versions": [
      "18.5.0"
    ]
  },
  {
    "title": "The Second Dream",
    "versions": [
      "18.4.13",
      "18.0.6"
    ]
  },
  {
    "title": "The Jordas Precept",
    "versions": [
      "17.8.1",
      "17.8.0",
      "17.7.1"
    ]
  },
  {
    "title": "Echoes of the Sentient",
    "versions": [
      "17.2.6"
    ]
  },
  {
    "title": "Tubemen of Regor",
    "versions": [
      "16.11.5",
      "16.5.5",
      "16.5.0"
    ]
  },
  {
    "title": "Sanctuary",
    "versions": [
      "16.4.0",
      "16.3.2",
      "16.2.0",
      "16.1.6",
      "16.1.5",
      "16.1.4.1",
      "16.1.3",
      "16.0.2"
    ]
  },
  {
    "title": "Eyes of Blight",
    "versions": [
      "15.14.1"
    ]
  },
  {
    "title": "Mesa Update",
    "versions": [
      "15.5.0"
    ]
  },
  {
    "title": "Archwing",
    "versions": [
      "15.0.8",
      "15.0.7",
      "15.0.6",
      "15.0.0"
    ]
  },
  {
    "title": "The Mad Cephalon",
    "versions": [
      "14.5.0",
      "14.0.0"
    ]
  },
  {
    "title": "The Dark Sectors",
    "versions": [
      "13.4.1",
      "13.4.0",
      "13.1.1",
      "13.0.4",
      "13.0.0"
    ]
  },
  {
    "title": "Zephyr Rises",
    "versions": [
      "12.5.2",
      "12.1.2"
    ]
  },
  {
    "title": "Shadows Of The Dead",
    "versions": [
      "10.8.0",
      "10.3.3"
    ]
  },
  {
    "title": "Vor's Revenge",
    "versions": [
      "9.1.0"
    ]
  },
  {
    "title": "Rise of the Warlords",
    "versions": [
      "8.3.0",
      "8.0.0"
    ]
  },
  {
    "title": "Stormbringer",
    "versions": [
      "7.10.2",
      "7.10.1",
      "7.10.0",
      "7.9.0",
      "7.8.1",
      "7.8.0",
      "7.7.4",
      "7.7.3",
      "7.7.2",
      "7.7.1",
      "7.7.0",
      "7.6.0",
      "7.5.1",
      "7.4.1",
      "7.4.0",
      "7.3.0"
    ]
  },
  {
    "title": "Beta 2",
    "versions": [
      "5.2.0",
      "5.1.0"
    ]
  }
];
