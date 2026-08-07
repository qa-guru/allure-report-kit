/**
 * Tile bar indicators.
 *
 * Rule: a dot appears only for a status family that is really on the chart
 * (`fromSeries`) or that the author listed explicitly. Nothing present →
 * `.indicator-row` is not rendered at all.
 *
 * This is NOT the macOS traffic-light cluster of `panel__dots` — that is a
 * different primitive with a fixed three-dot set.
 */
import type { DotsSpec, StatusFamily } from "../types.js";
import { orderFamilies } from "./palette.js";

export function resolveDots(spec: DotsSpec, rendered: readonly StatusFamily[]): StatusFamily[] {
  if (spec === false) {
    return [];
  }
  if (spec === "fromSeries") {
    return orderFamilies(rendered);
  }
  return orderFamilies(spec);
}

/** Write the indicator row into a tile bar, or remove it when empty. */
export function syncIndicatorRow(bar: HTMLElement, families: readonly StatusFamily[]): void {
  const existing = bar.querySelector<HTMLElement>(":scope > .indicator-row");

  if (families.length === 0) {
    existing?.remove();
    return;
  }

  const row = existing ?? document.createElement("div");
  if (!existing) {
    row.className = "indicator-row";
    row.setAttribute("aria-hidden", "true");
    bar.insertBefore(row, bar.firstChild);
  }

  row.replaceChildren(
    ...families.map((family) => {
      const dot = document.createElement("span");
      dot.className = `indicator indicator--status-${family}`;
      return dot;
    }),
  );
}
