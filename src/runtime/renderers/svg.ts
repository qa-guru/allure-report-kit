/**
 * SVG renderer — kit canon, no chart library.
 *
 * Owns the testing pyramid: rounded tiers, narrow top → wide bottom, gap taken
 * from the durations histogram so the two tiles read as one family. Geometry is
 * the design-system canon (`widget-tile-mocks.js` → `pyramidSvg`); the same
 * shape the allure-notifications Telegram collage renders.
 */
import type { StatusFamily } from "../../types.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";
import { LAYER_FAMILIES, familyForColor, orderFamilies } from "../palette.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Half the tier radius of the regular tier — matches the DS canon. */
const CHART_RX = 4;
const MIN_FRACTION = 0.2;
const BAR_FILL = 0.72;

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
  const rows = [...model.series].reverse();
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
  const families = new Set<StatusFamily>();

  rows.forEach((series, index) => {
    const fraction =
      count === 1 ? 1 : MIN_FRACTION + (1 - MIN_FRACTION) * (index / (count - 1));
    const width = funnelWidth * fraction;
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
      if (label.getComputedTextLength() <= available) {
        break;
      }
      label.textContent = candidate;
    }
    if (label.getComputedTextLength() > available) {
      label.remove();
      continue;
    }
    delete label.dataset.arkFits;
    delete label.dataset.arkFallbacks;
  }
}

export const svgRenderer: ChartRenderer = {
  id: "svg",
  supports: (model: ChartModel) => model.kind === "pyramid",
  render: async (context) => renderPyramid(context),
  destroy: (host) => host.replaceChildren(),
};
