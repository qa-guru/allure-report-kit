/**
 * Which status families a tile is allowed to show as bar dots.
 *
 * Shared by every renderer, because "the dot is on the chart" is a kit rule and
 * not a per-backend detail.
 *
 * Two sources, in this order:
 *
 *   1. the model — a series (or a single point) states its `family`, or carries a
 *      colour the family can be derived from;
 *   2. the paint — the fills the renderer actually left in the DOM.
 *
 * The paint is used as a *filter*, never as a source. Nearest-anchor matching of
 * an arbitrary fill is not trustworthy for this palette: the dark-theme layer
 * colour `#ffa833` (`component`, an orange) sits closer to the yellow anchor
 * than to the orange one, and `#5d6876` (`other`, a grey) closer to green. So a
 * declared family is authoritative — but a family whose colour was never
 * painted (an all-zero stacked series, a slice the library dropped) does not
 * earn a dot.
 */
import type { StatusFamily } from "../types.js";
import { familyForColor, orderFamilies, paintedColors, sameColor } from "./palette.js";
import type { RenderContext } from "./model.js";

interface Candidate {
  family: StatusFamily;
  color?: string;
}

/**
 * Does this series put anything on the chart?
 *
 * A group measured at zero — an empty layer, a rate of 0% — still declares its
 * colour, and a backend will happily emit a zero-height bar complete with a
 * fill. The dot has to follow the data, not the declaration.
 */
function drawsSomething(series: { value?: number; points?: { y: number }[] }): boolean {
  if (series.points?.length) {
    return series.points.some((point) => point.y !== 0);
  }
  return series.value !== 0;
}

function candidates(context: RenderContext, colors: string[]): Candidate[] {
  const found: Candidate[] = [];

  context.model.series.forEach((series, index) => {
    const color = series.color ?? colors[index];
    const family = series.family ?? familyForColor(color);
    if (family && drawsSomething(series)) {
      found.push({ family, color });
    }
    // A point may overrule its series — `stabilityDistribution` colours each
    // group by its own threshold rather than splitting into two series.
    for (const point of series.points ?? []) {
      const pointFamily = point.family ?? familyForColor(point.color);
      if (pointFamily && point.y !== 0) {
        found.push({ family: pointFamily, color: point.color ?? color });
      }
    }
  });

  return found;
}

export interface FamiliesOptions {
  /**
   * CSS selector for the data marks of this renderer, relative to the host.
   *
   * Data marks only: an axis line or a label caught by the selector would keep
   * alive a family that is not visible on the chart. Omit it when the renderer
   * cannot name its marks — then every declared family is trusted.
   */
  marks?: string;
}

export function familiesOf(
  context: RenderContext,
  colors: string[],
  options: FamiliesOptions = {},
): StatusFamily[] {
  const declared = candidates(context, colors);

  if (!options.marks) {
    return orderFamilies(declared.map((candidate) => candidate.family));
  }

  const painted = paintedColors(context.host, options.marks);
  // Nothing recognisable in the DOM — a canvas backend, or a mark shape without
  // a `fill` attribute. Filtering here would blank the row for no reason.
  if (painted.length === 0) {
    return orderFamilies(declared.map((candidate) => candidate.family));
  }

  return orderFamilies(
    declared
      .filter(
        (candidate) =>
          candidate.color === undefined ||
          painted.some((fill) => sameColor(fill, candidate.color)),
      )
      .map((candidate) => candidate.family),
  );
}
