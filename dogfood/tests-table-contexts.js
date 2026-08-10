/**
 * Tests table — one page, three contexts (palette · collage editor · TG preview).
 * Sizes from builder freeCellRect @ CB-870 (870×1080, gap 14, grid 10×10).
 */
import { theme } from "../dist/index.js";
import { createKitRuntime } from "../dist/runtime/index.js";
import { renderTestsTableHost } from "../dist/runtime/tests-table-render.js";
import testsTableFixture from "../test/fixtures/tests-table-panel.json" with { type: "json" };

const CANVAS = {
  width: 870,
  height: 1080,
  cardGap: 14,
  headerHeight: 31,
  tilePad: 6,
  gridCols: 10,
  gridRows: 10,
};

/** Builder `freeCellRect` — logical canvas px. */
function freeCellRect(item) {
  const { width, height, cardGap, gridCols, gridRows } = {
    ...CANVAS,
    width: CANVAS.width,
    height: CANVAS.height,
  };
  const half = Math.floor(cardGap / 2);
  const cellW = width / gridCols;
  const cellH = height / gridRows;
  const { x, y, w, h } = item;
  const rawLeft = x * cellW;
  const rawTop = y * cellH;
  const rawRight = (x + w) * cellW;
  const rawBottom = (y + h) * cellH;
  const left = x === 0 ? cardGap : rawLeft + half;
  const top = y === 0 ? cardGap : rawTop + half;
  const right = x + w === gridCols ? width - cardGap : rawRight - half;
  const bottom = y + h === gridRows ? height - cardGap : rawBottom - half;
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function tierForSpan(w, h) {
  const n = CANVAS.gridCols;
  const area = w * h;
  if (n <= 1 || (w >= n && h >= n)) return "hero";
  if (area >= 6 || (w >= 3 && h >= 3)) return "hero";
  if (area >= 4) return "regular";
  if (area >= 2) return "compact";
  if (n >= 3) return "micro";
  return "compact";
}

const COLLAGE_FOOTPRINTS = [
  { key: "1×2", w: 1, h: 2, x: 0, y: 0 },
  { key: "2×2", w: 2, h: 2, x: 0, y: 2 },
  { key: "3×4", w: 3, h: 4, x: 3, y: 0 },
  { key: "10×10", w: 10, h: 10, x: 0, y: 0 },
];

const runtime = createKitRuntime({ theme: theme.qaGuru() });

function cssVar(host) {
  return (name, fallback = "") => {
    const value = getComputedStyle(host).getPropertyValue(name).trim();
    return value || fallback;
  };
}

function isDark() {
  const root = document.documentElement;
  return root.classList.contains("theme-dark") || root.getAttribute("data-theme") === "dark";
}

function mountTestsTable(body) {
  renderTestsTableHost(
    body,
    testsTableFixture,
    { cssVar: cssVar(body), isDark },
  );
}

function readRowMeta(body) {
  const tbody = body.querySelector("tbody");
  const rows = body.querySelectorAll("tbody tr").length;
  const maxRows = Number(tbody?.dataset.maxRows ?? 0);
  const firstName = body.querySelector("td.tests-table-panel__name")?.textContent?.trim() ?? "";
  return { rows, maxRows, firstName };
}

function metaLine(rect, tier, extra) {
  const parts = [
    `<strong>${extra.label}</strong>`,
    `${rect.width}×${rect.height}px`,
    `tier ${tier}`,
    `${extra.rows} rows (max ${extra.maxRows})`,
  ];
  if (extra.firstName) {
    parts.push(`«${extra.firstName.slice(0, 28)}${extra.firstName.length > 28 ? "…" : ""}»`);
  }
  return parts.join(" · ");
}

function paletteBarHtml() {
  const dots = ["green", "red", "yellow"];
  return (
    `<div class="indicator-row" aria-hidden="true">` +
    dots.map((d) => `<span class="indicator indicator--status-${d}"></span>`).join("") +
    `</div>`
  );
}

function mountPalette(root) {
  const slot = document.createElement("div");
  slot.className = "ttc-cell ttc-palette-slot";
  slot.dataset.testid = "ttc-palette-2x2";

  const fig = document.createElement("figure");
  fig.className = "widget-tile widget-tile--tier-micro widget-tile--layout-2x2";

  const bar = document.createElement("div");
  bar.className = "widget-tile__bar";
  bar.innerHTML = paletteBarHtml();

  const title = document.createElement("span");
  title.className = "widget-tile__title";
  title.textContent = "Tests table";
  bar.append(title);

  const body = document.createElement("div");
  body.className = "widget-tile__body";

  fig.append(bar, body);
  slot.append(fig);

  const meta = document.createElement("p");
  meta.className = "ttc-cell__meta";
  slot.append(meta);

  root.append(slot);
  mountTestsTable(body);
  const info = readRowMeta(body);
  meta.innerHTML = metaLine({ width: 128, height: 128 }, "micro", {
    label: "Palette 2×2",
    ...info,
  });
}

function editorBodySize(rect) {
  // anb-panel: bar 31px + body pad 6×2; inner host fills body.
  return {
    width: rect.width,
    height: Math.max(1, rect.height - CANVAS.headerHeight - CANVAS.tilePad * 2),
  };
}

function mountEditorPanel(root, item) {
  const rect = freeCellRect(item);
  const tier = tierForSpan(item.w, item.h);
  const bodySize = editorBodySize(rect);
  const isHero = item.w >= 10;

  const cell = document.createElement("div");
  cell.className = isHero ? "ttc-cell ttc-cell--hero" : "ttc-cell";
  cell.dataset.testid = `ttc-editor-${item.w}x${item.h}`;

  const panel = document.createElement("div");
  panel.className = "ttc-editor-panel";
  panel.style.width = `${rect.width}px`;
  panel.style.height = `${rect.height}px`;
  if (isHero) {
    const scale = 0.34;
    panel.style.transform = `scale(${scale})`;
    cell.style.height = `${Math.round(rect.height * scale)}px`;
  }

  const bar = document.createElement("div");
  bar.className = "ttc-editor-panel__bar";
  bar.innerHTML = `<span class="ttc-editor-panel__title">Tests table</span>`;

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "ttc-editor-panel__body";

  const host = document.createElement("div");
  host.className = `ttc-editor-panel__host tests-table-host--tier-${tier}`;
  host.style.width = "100%";
  host.style.height = `${bodySize.height}px`;

  bodyWrap.append(host);
  panel.append(bar, bodyWrap);
  cell.append(panel);

  const meta = document.createElement("p");
  meta.className = "ttc-cell__meta";
  cell.append(meta);

  root.append(cell);
  mountTestsTable(host);
  const info = readRowMeta(host);
  meta.innerHTML = metaLine(rect, tier, { label: `Editor ${item.key}`, ...info });
}

function mountPreviewTile(root, item) {
  const rect = freeCellRect(item);
  const tier = tierForSpan(item.w, item.h);
  const isHero = item.w >= 10;

  const cell = document.createElement("div");
  cell.className = isHero ? "ttc-cell ttc-cell--hero" : "ttc-cell";
  cell.dataset.testid = `ttc-preview-${item.w}x${item.h}`;

  const tile = document.createElement("figure");
  tile.className = `widget-tile widget-tile--tier-${tier}`;
  tile.style.width = `${rect.width}px`;
  tile.style.height = `${rect.height}px`;
  tile.style.setProperty("--wt-bar-height", `${CANVAS.headerHeight}px`);
  tile.style.setProperty("--wt-pad", `${CANVAS.tilePad}px`);
  if (isHero) {
    const scale = 0.34;
    tile.style.transform = `scale(${scale})`;
    cell.style.height = `${Math.round(rect.height * scale)}px`;
  }

  const bar = document.createElement("div");
  bar.className = "widget-tile__bar";
  const title = document.createElement("span");
  title.className = "widget-tile__title";
  title.textContent = "Tests table";
  bar.append(title);

  const body = document.createElement("div");
  body.className = "widget-tile__body";

  tile.append(bar, body);
  cell.append(tile);

  const meta = document.createElement("p");
  meta.className = "ttc-cell__meta";
  cell.append(meta);

  root.append(cell);
  mountTestsTable(body);
  const info = readRowMeta(body);
  meta.innerHTML = metaLine(rect, tier, { label: `Preview ${item.key}`, ...info });
}

function main() {
  runtime.injectTheme();

  const paletteRoot = document.getElementById("ttc-palette");
  const editorRoot = document.getElementById("ttc-editor");
  const previewRoot = document.getElementById("ttc-preview");

  mountPalette(paletteRoot);
  for (const item of COLLAGE_FOOTPRINTS) {
    mountEditorPanel(editorRoot, item);
    mountPreviewTile(previewRoot, item);
  }
}

try {
  main();
} catch (error) {
  const banner = document.getElementById("ttc-error");
  if (banner) {
    banner.hidden = false;
    banner.textContent = String(error?.stack ?? error);
  }
}
