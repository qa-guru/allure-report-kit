#!/usr/bin/env node
/**
 * Build the artefacts `singleFile: true` needs.
 *
 * A single-file report is one HTML document: nothing can be fetched, so the
 * design-system header has to arrive as one script and one stylesheet. In the
 * normal report the kit copies the DS tree as is, because the header module
 * resolves its own template and siblings relative to its URL — exactly what an
 * inlined module cannot do.
 *
 * Two outputs, both under `dist/theme/`:
 *
 *   header.bundle.js   the DS header and its three siblings as one ES module;
 *   header.inline.css  `header.css` with every `@import` flattened.
 *
 * The vendored DS copy is never edited — this reads it and `npm run sync:ds`
 * keeps it honest.
 *
 * Usage: node scripts/build-inline.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const THEME = join(ROOT, "src/theme");
const OUT = join(ROOT, "dist/theme");

/**
 * Stand-in for `import.meta.url` inside the bundle.
 *
 * The DS header resolves `../templates/header.html` against its own URL. Loaded
 * from a `data:` URL that resolution throws — a data URL has an opaque path and
 * cannot be a base — so the reference is redirected to a global the kit sets to
 * the document before importing. The template itself is then served by the
 * scoped fetch shim in `runtime/header.ts`.
 */
const BASE_URL_GLOBAL = "__arkHeaderBaseUrl";

/**
 * Entry point of the bundle.
 *
 * Re-exports `syncThemeToggleIcon` next to the header: the theme mirror needs
 * it, and a second `import()` of a sibling file is precisely what is not
 * available once everything is inlined.
 */
const ENTRY = `
export * from "./vendor/design-system/js/header.js";
export { syncThemeToggleIcon } from "./vendor/design-system/js/theme-icons.js";
`;

const IMPORT_PATTERN = /@import\s+url\(\s*["']([^"']+)["']\s*\)\s*;?/g;

/** Inline `@import url(...)` recursively; the DS layer has no other assets. */
async function flattenCss(path, seen = new Set()) {
  if (seen.has(path)) {
    return "";
  }
  seen.add(path);

  const source = await readFile(path, "utf8");
  const imports = [...source.matchAll(IMPORT_PATTERN)];
  let output = source.replace(IMPORT_PATTERN, "");

  const inlined = [];
  for (const [, href] of imports) {
    inlined.push(await flattenCss(resolve(dirname(path), href), seen));
  }
  // Imports come first in the cascade, exactly where the browser would put them.
  output = `${inlined.join("\n")}\n${output}`;
  return output;
}

await mkdir(OUT, { recursive: true });

const bundled = await build({
  stdin: { contents: ENTRY, resolveDir: THEME, sourcefile: "header-entry.js", loader: "js" },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "import.meta.url": BASE_URL_GLOBAL },
  write: false,
});

const [output] = bundled.outputFiles;
await writeFile(join(OUT, "header.bundle.js"), output.text, "utf8");

const css = await flattenCss(join(THEME, "header.css"));
await writeFile(join(OUT, "header.inline.css"), css, "utf8");

console.log(
  `build-inline: header.bundle.js ${Math.round(output.text.length / 1024)}kb, ` +
    `header.inline.css ${Math.round(css.length / 1024)}kb`,
);
