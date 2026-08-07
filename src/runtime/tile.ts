/**
 * Widget tile shell — the design-system `widget-tile` primitive in DOM form.
 *
 *   .widget-tile
 *     .widget-tile__bar    → .indicator-row (first) + .widget-tile__title
 *     .widget-tile__body   → chart host
 *
 * CSS canon lives in design-system/css/widget-tile.css; the kit ships a pinned
 * copy under src/theme/vendor/design-system/.
 */
import type { TileLayout, TileTier } from "../types.js";

export interface TileElements {
  root: HTMLElement;
  bar: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
}

export interface CreateTileOptions {
  title?: string;
  layout?: TileLayout;
  tier?: TileTier;
  /** Chart bleeds to the tile edge (no body padding). */
  bleed?: boolean;
  bar?: boolean;
}

function applyModifiers(root: HTMLElement, options: CreateTileOptions): void {
  if (options.layout) {
    root.classList.add(`widget-tile--layout-${options.layout}`);
  }
  if (options.tier) {
    root.classList.add(`widget-tile--tier-${options.tier}`);
  }
  if (options.bleed) {
    root.classList.add("widget-tile--bleed");
  }
}

export function createTile(options: CreateTileOptions = {}): TileElements {
  const root = document.createElement("figure");
  root.className = "widget-tile";
  applyModifiers(root, options);

  const bar = document.createElement("div");
  bar.className = "widget-tile__bar";

  const title = document.createElement("figcaption");
  title.className = "widget-tile__title";
  title.textContent = options.title ?? "";
  bar.append(title);

  const body = document.createElement("div");
  body.className = "widget-tile__body";

  if (options.bar === false) {
    root.append(body);
  } else {
    root.append(bar, body);
  }

  return { root, bar, title, body };
}

/** Reuse existing tile markup when the host is already a `.widget-tile`. */
export function adoptTile(root: HTMLElement): TileElements | undefined {
  const bar = root.querySelector<HTMLElement>(":scope > .widget-tile__bar");
  const body = root.querySelector<HTMLElement>(":scope > .widget-tile__body");
  const title = root.querySelector<HTMLElement>(".widget-tile__title");
  if (!bar || !body || !title) {
    return undefined;
  }
  return { root, bar, title, body };
}
