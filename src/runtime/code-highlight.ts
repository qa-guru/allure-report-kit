const JSON_TOKEN =
  /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

function escapeHtmlKeepQuotes(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function dangerSet(
  literals: Set<string> | string[] | undefined,
): Set<string> | undefined {
  if (!literals) {
    return undefined;
  }
  return literals instanceof Set ? literals : new Set(literals);
}

function tokenClass(
  token: string,
  prefix: string,
  dangerLiterals: Set<string> | undefined,
): string {
  if (/^"/.test(token)) {
    return /:\s*$/.test(token) ? `${prefix}-key` : `${prefix}-str`;
  }
  if (token === "true" || token === "false") {
    return `${prefix}-bool`;
  }
  if (token === "null") {
    return `${prefix}-null`;
  }
  return dangerLiterals?.has(token) ? `${prefix}-danger` : `${prefix}-num`;
}

/** JSON syntax highlight — mirrors design-system/js/code-highlight.js */
export function highlightJson(
  json: string,
  options?: { prefix?: string; dangerLiterals?: Set<string> | string[] },
): string {
  const prefix = options?.prefix ?? "ch-tok";
  const dangerLiterals = dangerSet(options?.dangerLiterals);
  let html = escapeHtmlKeepQuotes(json);

  html = html.replace(JSON_TOKEN, (match) => {
    if (/^"/.test(match) && /:\s*$/.test(match)) {
      const key = match.replace(/:\s*$/, "");
      return `<span class="${prefix}-key">${key}</span><span class="${prefix}-punct">:</span>`;
    }
    return `<span class="${tokenClass(match, prefix, dangerLiterals)}">${match}</span>`;
  });

  html = html.replace(/([{}\[\],])/g, (ch) => `<span class="${prefix}-punct">${ch}</span>`);

  return html;
}

function appendText(host: ParentNode, value: string, className?: string): void {
  if (!value) {
    return;
  }
  if (!className) {
    host.append(value);
    return;
  }
  const span = document.createElement("span");
  span.className = className;
  span.textContent = value;
  host.append(span);
}

function appendPunctChunk(host: ParentNode, chunk: string, prefix: string): void {
  for (const ch of chunk) {
    appendText(host, ch, /[{}\[\],]/.test(ch) ? `${prefix}-punct` : undefined);
  }
}

/** Same tokens as `highlightJson`, as DOM nodes — no `innerHTML`. */
export function paintHighlightedJson(
  host: ParentNode,
  json: string,
  options?: { prefix?: string; dangerLiterals?: Set<string> | string[] },
): void {
  const prefix = options?.prefix ?? "ch-tok";
  const dangerLiterals = dangerSet(options?.dangerLiterals);
  const text = String(json);
  let cursor = 0;

  for (const match of text.matchAll(JSON_TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      appendPunctChunk(host, text.slice(cursor, start), prefix);
    }
    const token = match[0];
    if (/^"/.test(token) && /:\s*$/.test(token)) {
      appendText(host, token.replace(/:\s*$/, ""), `${prefix}-key`);
      appendText(host, ":", `${prefix}-punct`);
    } else {
      appendText(host, token, tokenClass(token, prefix, dangerLiterals));
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) {
    appendPunctChunk(host, text.slice(cursor), prefix);
  }
}
