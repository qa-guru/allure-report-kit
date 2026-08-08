/**
 * Colour ↔ status-family mapping.
 *
 * Families are the seven Allure 3 chart swatches used by the tile bar dots.
 * A series states its family explicitly whenever it can; when it only has a
 * colour, the nearest anchor in RGB space wins — the same "по факту" rule the
 * monorepo `dashboard-overrides.js` applies to rendered SVG fills.
 */
import { STATUS_FAMILIES, type StatusFamily } from "../types.js";

export const FAMILY_ANCHORS: Record<StatusFamily, string> = {
  red: "#fd5a3e",
  orange: "#ff8200",
  yellow: "#ffd050",
  purple: "#b46fd8",
  gray: "#aaaaaa",
  green: "#49cb68",
  blue: "#4b9bff",
};

/** Layer name → theme token. Pyramid palette canon. */
export const LAYER_TOKENS: Record<string, string> = {
  unit: "--ark-layer-unit",
  component: "--ark-layer-component",
  integration: "--ark-layer-integration",
  api: "--ark-layer-api",
  e2e: "--ark-layer-e2e",
  manual: "--ark-layer-manual",
  other: "--ark-layer-other",
};

/** Layer → family, mirroring `pyramid-layers.json` statusMapping. */
export const LAYER_FAMILIES: Record<string, StatusFamily> = {
  unit: "green",
  component: "orange",
  integration: "purple",
  api: "yellow",
  e2e: "red",
  manual: "blue",
  other: "gray",
};

export const STATUS_TOKENS: Record<string, string> = {
  passed: "--ark-status-passed",
  failed: "--ark-status-failed",
  broken: "--ark-status-broken",
  skipped: "--ark-status-skipped",
  unknown: "--ark-status-unknown",
};

export const STATUS_FAMILY: Record<string, StatusFamily> = {
  passed: "green",
  failed: "red",
  broken: "yellow",
  skipped: "gray",
  unknown: "purple",
};

type Rgb = [number, number, number];

function parseHex(value: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match?.[1]) {
    return undefined;
  }
  const hex = match[1];
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function parseRgbFunction(value: string): Rgb | undefined {
  const match = /rgba?\(([^)]+)\)/i.exec(value);
  if (!match?.[1]) {
    return undefined;
  }
  const parts = match[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number.parseFloat);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) {
    return undefined;
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

export function parseColor(value: string | undefined): Rgb | undefined {
  if (!value) {
    return undefined;
  }
  return parseHex(value) ?? parseRgbFunction(value);
}

export interface FamilyMatchOptions {
  /**
   * Reject colours further than this from every anchor (RGB distance, 0..441).
   *
   * Unbounded matching is right for a series colour, which is a palette token by
   * construction. It is wrong for a colour scraped off the paint, where a muted
   * axis grey would silently become a `gray` dot.
   */
  maxDistance?: number;
}

/** Nearest family anchor in RGB space; `undefined` for unparsable colours. */
export function familyForColor(
  color: string | undefined,
  options: FamilyMatchOptions = {},
): StatusFamily | undefined {
  const rgb = parseColor(color);
  if (!rgb) {
    return undefined;
  }
  let best: StatusFamily | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const family of STATUS_FAMILIES) {
    const anchor = parseColor(FAMILY_ANCHORS[family]);
    if (!anchor) {
      continue;
    }
    const distance =
      (rgb[0] - anchor[0]) ** 2 + (rgb[1] - anchor[1]) ** 2 + (rgb[2] - anchor[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = family;
    }
  }
  if (options.maxDistance !== undefined && bestDistance > options.maxDistance ** 2) {
    return undefined;
  }
  return best;
}

/**
 * Two colours are the same swatch.
 *
 * Not string equality: a library may re-serialise `#fd5a3e` as
 * `rgb(253, 90, 62)`, flatten an alpha channel or round a component.
 */
export function sameColor(left: string | undefined, right: string | undefined): boolean {
  const a = parseColor(left);
  const b = parseColor(right);
  if (!a || !b) {
    return false;
  }
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 <= 12 ** 2;
}

/** Colours of the data marks the renderer left in the DOM. */
export function paintedColors(host: ParentNode, selector: string): string[] {
  const colors: string[] = [];
  for (const node of host.querySelectorAll(selector)) {
    const fill = node.getAttribute("fill");
    if (fill) {
      colors.push(fill);
    }
  }
  return colors;
}

/** Sort families into the canonical bar order and drop duplicates. */
export function orderFamilies(families: Iterable<StatusFamily>): StatusFamily[] {
  const present = new Set(families);
  return STATUS_FAMILIES.filter((family) => present.has(family));
}
