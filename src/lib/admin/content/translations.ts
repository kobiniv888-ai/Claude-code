/**
 * Interface-text editor helpers (pure, client-safe). Message files are nested JSON objects;
 * the editor works with flat "path.to.key" rows. TranslationOverride.key is
 * "<namespace>.<path.to.key>".
 */

export type MessageRow = {
  /** Path inside the namespace, e.g. "filters.city". */
  key: string;
  /** English source text. */
  source: string;
  /** Text in the chosen language's file ("" when the key is missing there). */
  current: string;
  /** Admin override, or null. */
  override: string | null;
};

/** Nested messages → [["a.b", "text"], …] (only string leaves, in file order). */
export function flattenMessages(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return prefix ? [[prefix, value]] : [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const out: [string, string][] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out.push(...flattenMessages(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

export function overrideKey(namespace: string, key: string): string {
  return `${namespace}.${key}`;
}

/** Rows for one namespace and language. */
export function buildMessageRows(
  source: unknown,
  localized: unknown,
  overrides: ReadonlyMap<string, string>,
): MessageRow[] {
  const current = new Map(flattenMessages(localized));
  return flattenMessages(source).map(([key, text]) => ({
    key,
    source: text,
    current: current.get(key) ?? "",
    override: overrides.get(key) ?? null,
  }));
}

/** Case-insensitive search in the key, the English text, the file text and the override. */
export function filterMessageRows(
  rows: readonly MessageRow[],
  opts: { query?: string; onlyOverridden?: boolean; onlyMissing?: boolean },
): MessageRow[] {
  const q = opts.query?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (opts.onlyOverridden && row.override === null) return false;
    if (opts.onlyMissing && row.current !== "") return false;
    if (!q) return true;
    return [row.key, row.source, row.current, row.override ?? ""].some((v) => v.toLowerCase().includes(q));
  });
}

/** ICU argument names used in a message: "{count, plural, one {…}}" → "count" (nested too). */
export function messageArguments(message: string): string[] {
  const names = new Set<string>();
  let i = 0;

  const skipSpace = () => {
    while (i < message.length && /\s/.test(message[i])) i++;
  };
  // Message text until an unmatched "}" (or the end).
  const readText = () => {
    while (i < message.length) {
      const ch = message[i];
      if (ch === "'" && (message[i + 1] === "{" || message[i + 1] === "}")) {
        const end = message.indexOf("'", i + 1);
        i = end === -1 ? message.length : end + 1;
      } else if (ch === "{") {
        readArgument();
      } else if (ch === "}") {
        return;
      } else {
        i++;
      }
    }
  };
  // At "{": "{name}", "{name, number}", "{name, plural, one {…} other {…}}".
  const readArgument = () => {
    i++;
    skipSpace();
    const name = /^[A-Za-z_][\w]*/.exec(message.slice(i))?.[0];
    if (!name) {
      skipBlock(1);
      return;
    }
    names.add(name);
    i += name.length;
    skipSpace();
    if (message[i] === "}") {
      i++;
      return;
    }
    if (message[i] !== ",") {
      skipBlock(1);
      return;
    }
    i++;
    skipSpace();
    const type = /^[A-Za-z]+/.exec(message.slice(i))?.[0] ?? "";
    i += type.length;
    if (type !== "plural" && type !== "select" && type !== "selectordinal") {
      skipBlock(1);
      return;
    }
    // Options: [offset:n] selector {message} …
    while (i < message.length && message[i] !== "}") {
      if (message[i] === "{") {
        i++;
        readText();
        if (message[i] === "}") i++;
      } else {
        i++;
      }
    }
    if (message[i] === "}") i++;
  };
  // Skips to the brace that closes the current block (depth already open).
  const skipBlock = (depth: number) => {
    while (i < message.length && depth > 0) {
      if (message[i] === "{") depth++;
      else if (message[i] === "}") depth--;
      i++;
    }
  };

  while (i < message.length) {
    readText();
    if (message[i] === "}") i++; // stray closing brace
  }
  return [...names];
}

/** Rich-text tag names used in a message: "<b>x</b>" → "b". */
export function messageTags(message: string): string[] {
  return [...new Set([...message.matchAll(/<([A-Za-z][\w-]*)>/g)].map((m) => m[1]))];
}

/**
 * Problems an override would cause: an argument or tag the code does not provide
 * (the page would show an error instead of the text).
 */
export function overrideProblems(source: string, value: string): { unknownArguments: string[]; unknownTags: string[] } {
  const args = new Set(messageArguments(source));
  const tags = new Set(messageTags(source));
  return {
    unknownArguments: messageArguments(value).filter((name) => !args.has(name)),
    unknownTags: messageTags(value).filter((name) => !tags.has(name)),
  };
}

/** Namespace file names are plain identifiers ("search", "listingCard"). */
export function isNamespaceName(value: string): boolean {
  return /^[A-Za-z][\w-]{0,63}$/.test(value);
}
