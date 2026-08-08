const JSON_TOKEN =
  /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

function escapeHtmlKeepQuotes(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** JSON syntax highlight — mirrors design-system/js/code-highlight.js */
export function highlightJson(
  json: string,
  options?: { prefix?: string; dangerLiterals?: Set<string> | string[] },
): string {
  const prefix = options?.prefix ?? "ch-tok";
  const dangerLiterals = options?.dangerLiterals
    ? options.dangerLiterals instanceof Set
      ? options.dangerLiterals
      : new Set(options.dangerLiterals)
    : undefined;
  let html = escapeHtmlKeepQuotes(json);

  html = html.replace(JSON_TOKEN, (match) => {
    if (/^"/.test(match)) {
      if (/:\s*$/.test(match)) {
        const key = match.replace(/:\s*$/, "");
        return `<span class="${prefix}-key">${key}</span><span class="${prefix}-punct">:</span>`;
      }
      return `<span class="${prefix}-str">${match}</span>`;
    }
    if (match === "true" || match === "false") {
      return `<span class="${prefix}-bool">${match}</span>`;
    }
    if (match === "null") {
      return `<span class="${prefix}-null">${match}</span>`;
    }
    const cls = dangerLiterals?.has(match) ? `${prefix}-danger` : `${prefix}-num`;
    return `<span class="${cls}">${match}</span>`;
  });

  html = html.replace(/([{}\[\],])/g, (ch) => `<span class="${prefix}-punct">${ch}</span>`);

  return html;
}
