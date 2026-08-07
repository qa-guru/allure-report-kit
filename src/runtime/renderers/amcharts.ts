/**
 * amCharts 5 renderer — adapter interface plus a spike.
 *
 * v0.1 ships the full adapter shape and one real chart (pie). When the
 * libraries are absent the tile draws an explicit stub instead of failing, so
 * the adapter contract stays visible in the dogfood page without forcing a
 * proprietary dependency on every consumer.
 */
import type { StatusFamily } from "../../types.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";
import { familyForColor, orderFamilies } from "../palette.js";

interface AmRootLike {
  container: { children: { push: <T>(child: T) => T } };
  dispose: () => void;
  _logo?: unknown;
}

interface AmCoreApi {
  Root: { new: (element: HTMLElement) => AmRootLike };
  color: (value: number | string) => unknown;
  p50?: unknown;
}

interface AmPercentApi {
  PieChart: { new: (root: AmRootLike, settings: Record<string, unknown>) => unknown };
  PieSeries: {
    new: (
      root: AmRootLike,
      settings: Record<string, unknown>,
    ) => { data: { setAll: (data: unknown[]) => void }; slices?: unknown };
  };
}

const roots = new WeakMap<HTMLElement, AmRootLike>();

function stub(context: RenderContext, reason: string): RenderResult {
  const box = document.createElement("div");
  box.className = "ark-stub";
  box.dataset.renderer = "amcharts";

  const title = document.createElement("span");
  title.className = "ark-stub__title";
  title.textContent = "amCharts adapter";

  const note = document.createElement("span");
  note.className = "ark-stub__note";
  note.textContent = reason;

  box.append(title, note);
  context.host.replaceChildren(box);

  return { families: [], renderedBy: "amcharts-stub", note: reason };
}

export const amchartsRenderer: ChartRenderer = {
  id: "amcharts",

  supports: (model: ChartModel) => model.kind === "pie",

  render: async (context: RenderContext): Promise<RenderResult> => {
    const core = (await context.resolveLib("amcharts")) as AmCoreApi | undefined;
    const percent = (await context.resolveLib("amcharts/percent")) as AmPercentApi | undefined;

    if (!core?.Root || !percent?.PieChart) {
      return stub(context, "npm i @amcharts/amcharts5 — spike, лицензия на стороне пользователя");
    }

    roots.get(context.host)?.dispose();
    context.host.replaceChildren();

    const root = core.Root.new(context.host);
    roots.set(context.host, root);

    const chart = root.container.children.push(
      percent.PieChart.new(root, { layout: undefined, innerRadius: 60 }),
    ) as { series: { push: <T>(child: T) => T } };

    const series = chart.series.push(
      percent.PieSeries.new(root, {
        categoryField: "name",
        valueField: "value",
        alignLabels: false,
      }),
    );

    series.data.setAll(
      context.model.series.map((item, index) => ({
        name: item.label ?? item.id,
        value: item.value ?? 0,
        color: item.color ?? context.cssVar(`--ark-series-${index}`, "#4b9bff"),
      })),
    );

    const families = new Set<StatusFamily>();
    context.model.series.forEach((item) => {
      const family = item.family ?? familyForColor(item.color);
      if (family) {
        families.add(family);
      }
    });

    return { families: orderFamilies(families), renderedBy: "amcharts" };
  },

  destroy: (host: HTMLElement) => {
    roots.get(host)?.dispose();
    roots.delete(host);
    host.replaceChildren();
  },
};
