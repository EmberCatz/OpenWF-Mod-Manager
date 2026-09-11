// Basic automated moderation for comment bodies — a blocklist and a link
// pattern, not a real content-safety system. Both are deliberately blunt
// (easy to route around with creative spelling/spacing); good enough to
// stop casual spam and profanity without adding a third-party dependency
// or an external API call to the comment-posting path.

// Matches http(s) URLs, bare www. hosts, and common TLDs following a
// domain-looking token — catches "check discord.gg/xyz" as well as full
// "https://..." links without also flagging plain prose that happens to
// contain a period.
const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|gg|co|dev|app|xyz|link|me|tv|to)\b/i;

export function containsLink(text: string): boolean {
  return LINK_RE.test(text);
}

// Deliberately short and conservative — common slurs/profanity only, not
// an exhaustive list. Matched on word boundaries, case-insensitive, so it
// doesn't trip on substrings inside unrelated words.
const PROFANITY_WORDLIST = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "faggot",
  "nigger",
  "nigga",
  "retard",
  "whore",
  "slut",
];

const PROFANITY_RE = new RegExp(`\\b(${PROFANITY_WORDLIST.join("|")})\\b`, "i");

export function containsProfanity(text: string): boolean {
  return PROFANITY_RE.test(text);
}
