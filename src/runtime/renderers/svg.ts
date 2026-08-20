/**
 * SVG renderer — kit canon, no chart library.
 *
 * Owns the testing pyramid: rounded tiers stacked in layer order, width ∝ test
 * count (peak layer fills the funnel). Gap matches the durations histogram so
 * the two tiles read as one family. Geometry is the DS report canon
 * (`widget-tile-mocks.js` → `pyramidSvg`, `rx=4`); collage uses
 * `testing-pyramid-geometry.ts` — different constants.
 *
 * Also draws the gauge, for the same reason: an arc with a number in it needs no
 * library, and keeping it here means a gauge panel renders in a report that
 * installed no chart backend at all.
 */
import type { StatusFamily } from "../../types.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";
import { LAYER_FAMILIES, familyForColor, orderFamilies } from "../palette.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Half the tier radius of the regular tier — matches the DS canon. */
const CHART_RX = 4;
const BAR_FILL = 0.72;

/**
 * Funnel width of a pyramid tier: the largest count is 1, zeros vanish.
 * Layer order is the stack; this is the quantitative axis.
 */
export function pyramidValueFraction(value: number | undefined, peak: number): number {
  if (!(peak > 0)) {
    return 0;
  }
  const count = value ?? 0;
  if (!(count > 0)) {
    return 0;
  }
  return count / peak;
}

interface Geometry {
  width: number;
  height: number;
  padX: number;
  padY: number;
  gap: number;
  rx: number;
  fontSize: number;
}

function geometryFor(tier: string | undefined, width: number, height: number): Geometry {
  const slot = (240 - 6 * 2) / 10;
  if (tier === "micro") {
    return {
      width,
      height,
      padX: 6,
      padY: 6,
      gap: ((240 - 4 * 2) / 10) * (1 - 0.82),
      rx: Math.max(2, CHART_RX / 2),
      fontSize: 0,
    };
  }
  if (tier === "compact") {
    return {
      width,
      height,
      padX: 8,
      padY: 6,
      gap: ((240 - 4 * 2) / 10) * (1 - BAR_FILL),
      rx: CHART_RX,
      fontSize: 11,
    };
  }
  return {
    width,
    height,
    padX: 10,
    padY: 8,
    gap: slot * (1 - BAR_FILL),
    rx: CHART_RX,
    fontSize: tier === "hero" ? 13 : 12,
  };
}

/**
 * The tile body already owns an aspect ratio (`--wt-layout-cols/rows`), so the
 * viewBox is derived from the declared layout rather than measured. Measuring
 * makes the box depend on paint order: a collapsed host on first paint and a
 * sized one on re-render produce different boxes, and labels get clipped.
 */
function viewBox(layout: string | undefined): { width: number; height: number } {
  const base = 240;
  const match = /^(\d+)x(\d+)$/.exec(layout ?? "");
  const cols = Number(match?.[1] ?? 1);
  const rows = Number(match?.[2] ?? 1);
  if (!cols || !rows) {
    return { width: base, height: base };
  }
  return { width: Math.round((base * cols) / rows), height: base };
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function renderPyramid(context: RenderContext): RenderResult {
  const { host, model, tile } = context;
  const box = viewBox(tile.layout);
  const geometry = geometryFor(tile.tier, box.width, box.height);
  const rows = [...model.series].reverse().filter((series) => (series.value ?? 0) > 0);
  const count = rows.length;

  const svg = element("svg", {
    viewBox: `0 0 ${geometry.width} ${geometry.height}`,
    role: "img",
    preserveAspectRatio: "xMidYMid meet",
    "aria-label": model.title ?? "Testing pyramid",
  });

  if (count === 0) {
    host.replaceChildren(svg);
    return { families: [], renderedBy: "svg" };
  }

  const bandHeight =
    (geometry.height - geometry.padY * 2 - geometry.gap * (count - 1)) / count;
  const centerX = geometry.width / 2;
  const funnelWidth = geometry.width - geometry.padX * 2;
  const peak = rows.reduce((max, series) => Math.max(max, series.value ?? 0), 0);
  const families = new Set<StatusFamily>();

  rows.forEach((series, index) => {
    const width = funnelWidth * pyramidValueFraction(series.value, peak);
    const y = geometry.padY + index * (bandHeight + geometry.gap);
    const color = series.color ?? context.cssVar(`--ark-layer-${series.id}`, "#64748b");

    svg.append(
      element("rect", {
        x: (centerX - width / 2).toFixed(1),
        y: y.toFixed(1),
        width: width.toFixed(1),
        height: bandHeight.toFixed(1),
        rx: geometry.rx,
        fill: color,
      }),
    );

    const family = series.family ?? LAYER_FAMILIES[series.id] ?? familyForColor(color);
    if (family) {
      families.add(family);
    }

    if (geometry.fontSize > 0) {
      const label = element("text", {
        x: centerX,
        y: (y + bandHeight / 2 + geometry.fontSize * 0.35).toFixed(1),
        "text-anchor": "middle",
        "font-size": geometry.fontSize,
        "font-weight": 600,
        fill: context.cssVar("--ark-band-ink", "rgba(255, 255, 255, 0.92)"),
      });
      const name = series.label ?? series.id;
      label.dataset.arkFits = String(Math.round(width - 8));
      label.textContent = series.value === undefined ? name : `${name} (${series.value})`;
      label.dataset.arkFallbacks = JSON.stringify(
        [series.value === undefined ? undefined : String(series.value), name.charAt(0).toUpperCase()]
          .filter(Boolean),
      );
      svg.append(label);
    }
  });

  host.replaceChildren(svg);
  fitLabels(svg);
  return { families: orderFamilies(families), renderedBy: "svg" };
}

function measuredTextLength(label: SVGTextElement): number {
  if (typeof label.getComputedTextLength !== "function") {
    return 0;
  }
  return label.getComputedTextLength();
}

/**
 * Band ink is only legible on the band itself, so a label wider than its tier
 * has to shrink: full name → count → initial → nothing. Measured after the SVG
 * is in the document, since `getComputedTextLength` needs a layout.
 */
function fitLabels(svg: SVGSVGElement): void {
  for (const label of svg.querySelectorAll<SVGTextElement>("text[data-ark-fits]")) {
    const available = Number(label.dataset.arkFits ?? 0);
    const fallbacks = JSON.parse(label.dataset.arkFallbacks ?? "[]") as string[];

    for (const candidate of fallbacks) {
      if (measuredTextLength(label) <= available) {
        break;
      }
      label.textContent = candidate;
    }
    if (measuredTextLength(label) > available) {
      label.remove();
      continue;
    }
    delete label.dataset.arkFits;
    delete label.dataset.arkFallbacks;
  }
}

/** Point on a circle, 0° at the top, clockwise — the arc convention here. */
function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function arcPath(cx: number, cy: number, radius: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, radius, from);
  const [x2, y2] = polar(cx, cy, radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Gauge — `series[0].value` against `model.total`, on a 240° arc. */
function renderGauge(context: RenderContext): RenderResult {
  const { host, model, tile } = context;
  const box = viewBox(tile.layout);
  const primary = model.series[0];
  const value = primary?.value ?? 0;
  const total = model.total ?? 100;
  const fraction = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0;

  const START = -120;
  const SWEEP = 240;
  const stroke = Math.max(10, Math.round(box.height * 0.07));
  const cx = box.width / 2;
  const cy = box.height * 0.62;
  const radius = Math.min(cx, cy) - stroke;
  const color = primary?.color ?? context.cssVar("--ark-status-passed", "#49cb68");

  const svg = element("svg", {
    viewBox: `0 0 ${box.width} ${box.height}`,
    role: "img",
    preserveAspectRatio: "xMidYMid meet",
    "aria-label": `${model.title ?? "Gauge"}: ${value} / ${total}`,
  });

  const track = element("path", {
    d: arcPath(cx, cy, radius, START, START + SWEEP),
    fill: "none",
    stroke: context.cssVar("--ark-border", "#e5e5e5"),
    "stroke-width": stroke,
    "stroke-linecap": "round",
  });
  svg.append(track);

  if (fraction > 0) {
    svg.append(
      element("path", {
        d: arcPath(cx, cy, radius, START, START + SWEEP * fraction),
        fill: "none",
        stroke: color,
        "stroke-width": stroke,
        "stroke-linecap": "round",
      }),
    );
  }

  const reading = element("text", {
    x: cx,
    y: cy,
    "text-anchor": "middle",
    "font-size": Math.round(box.height * 0.16),
    "font-weight": 800,
    fill: context.cssVar("--ark-text", "#1c1917"),
  });
  reading.textContent = model.formatValue?.(value) ?? String(value);
  svg.append(reading);

  const caption = element("text", {
    x: cx,
    y: cy + Math.round(box.height * 0.13),
    "text-anchor": "middle",
    "font-size": Math.round(box.height * 0.065),
    fill: context.cssVar("--ark-text-muted", "#777"),
  });
  caption.textContent = model.unit ? `${model.unit} ${total}` : `из ${total}`;
  svg.append(caption);

  host.replaceChildren(svg);

  const family = primary?.family ?? familyForColor(color);
  return { families: family ? [family] : [], renderedBy: "svg" };
}

export const svgRenderer: ChartRenderer = {
  id: "svg",
  supports: (model: ChartModel) => model.kind === "pyramid" || model.kind === "gauge",
  render: async (context) =>
    context.model.kind === "gauge" ? renderGauge(context) : renderPyramid(context),
  destroy: (host) => host.replaceChildren(),
};
