// A small hand-rolled tokenizer for syntax-highlighting .pluto files in
// the file preview. Pluto (https://pluto-lang.org/) is a Lua superset, so
// this covers standard Lua keywords plus Pluto's additions (class, enum,
// switch, continue, try/catch, etc.) — good enough for readable
// highlighting, not a full parser. Renders as React elements (never
// dangerouslySetInnerHTML) so there's no HTML-injection surface even
// though file content comes from a third-party upload.

const KEYWORDS = new Set([
  // Lua
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return",
  "then", "true", "until", "while",
  // Pluto extensions
  "class", "enum", "switch", "case", "default", "continue", "try", "catch",
  "const", "global", "static", "export", "extends", "new",
]);

export type PlutoTokenType = "keyword" | "string" | "comment" | "number" | "plain";

export interface PlutoToken {
  text: string;
  type: PlutoTokenType;
}

export function tokenizePluto(code: string): PlutoToken[] {
  const tokens: PlutoToken[] = [];
  const n = code.length;
  let i = 0;

  while (i < n) {
    const c = code[i];

    if (c === "-" && code[i + 1] === "-") {
      if (code.slice(i, i + 4) === "--[[") {
        const end = code.indexOf("]]", i + 4);
        const stop = end === -1 ? n : end + 2;
        tokens.push({ text: code.slice(i, stop), type: "comment" });
        i = stop;
        continue;
      }
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      tokens.push({ text: code.slice(i, stop), type: "comment" });
      i = stop;
      continue;
    }

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && code[j] !== c) {
        if (code[j] === "\\") j++;
        j++;
      }
      j = Math.min(j + 1, n);
      tokens.push({ text: code.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9a-fA-Fx.]/.test(code[j])) j++;
      tokens.push({ text: code.slice(i, j), type: "number" });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);
      tokens.push({ text: word, type: KEYWORDS.has(word) ? "keyword" : "plain" });
      i = j;
      continue;
    }

    // Whitespace/punctuation run — batched so we don't emit one token per character.
    let j = i + 1;
    while (j < n && !/[-"'0-9A-Za-z_]/.test(code[j])) j++;
    tokens.push({ text: code.slice(i, j), type: "plain" });
    i = j;
  }

  return tokens;
}

export function PlutoCode({ code }: { code: string }) {
  const tokens = tokenizePluto(code);
  return (
    <>
      {tokens.map((t, i) =>
        t.type === "plain" ? t.text : <span key={i} className={`tok-${t.type}`}>{t.text}</span>
      )}
    </>
  );
}
