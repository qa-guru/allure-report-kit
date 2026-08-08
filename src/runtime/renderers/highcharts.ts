/**
 * Highcharts renderer — v0.1 showcase backend.
 *
 * Highcharts is an optional peer and a commercial product: the kit ships no
 * Highcharts code and no licence key. A missing install degrades to the
 * registry fallback.
 */
import { familiesOf } from "../families.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";

interface HighchartsInstance {
  destroy: () => void;
  reflow: () => void;
}

interface HighchartsApi {
  chart: (container: HTMLElement, options: Record<string, unknown>) => HighchartsInstance;
}

const instances = new WeakMap<HTMLElement, HighchartsInstance>();
const observers = new WeakMap<HTMLElement, ResizeObserver>();

/** Data marks only — Highcharts groups its series under a stable class. */
const MARKS = '.highcharts-series path[fill]:not([fill="none"]), .highcharts-series rect[fill]';

function colorsOf(context: RenderContext): string[] {
  return context.model.series.map(
    (series, index) => series.color ?? context.cssVar(`--ark-series-${index}`, "#4b9bff"),
  );
}

function baseOptions(context: RenderContext): Record<string, unknown> {
  return {
    credits: { enabled: false },
    accessibility: { enabled: false },
    chart: {
      backgroundColor: "transparent",
      style: { fontFamily: "inherit" },
      spacing: [4, 4, 4, 4],
      animation: false,
    },
    title: { text: undefined },
    legend: { enabled: false },
    plotOptions: { series: { animation: false } },
  };
}

function pieOptions(context: RenderContext, colors: string[]): Record<string, unknown> {
  const { model } = context;
  const total =
    model.total ?? model.series.reduce((sum, series) => sum + (series.value ?? 0), 0);
  const primary = model.series[0]?.value ?? 0;
  const percentage = model.percentage ?? (total > 0 ? (primary / total) * 100 : 0);

  return {
    ...baseOptions(context),
    colors,
    chart: { ...(baseOptions(context).chart as object), type: "pie" },
    tooltip: { pointFormat: "<b>{point.y}</b>" },
    title: {
      text: `${percentage.toFixed(2)}%`,
      align: "center",
      verticalAlign: "middle",
      y: -6,
      style: {
        fontSize: "26px",
        fontWeight: "800",
        color: context.cssVar("--ark-text", "#1c1917"),
      },
    },
    subtitle: {
      text: model.unit ? `${model.unit} ${total}` : `из ${total}`,
      align: "center",
      verticalAlign: "middle",
      y: 20,
      style: { fontSize: "13px", color: context.cssVar("--ark-text-muted", "#777") },
    },
    plotOptions: {
      pie: {
        innerSize: "80%",
        borderWidth: 3,
        borderRadius: 9,
        borderColor: "transparent",
        dataLabels: { enabled: false },
        states: { hover: { halo: { size: 0 } } },
      },
    },
    series: [
      {
        type: "pie",
        data: model.series.map((series, index) => ({
          name: series.label ?? series.id,
          y: series.value ?? 0,
          color: colors[index],
        })),
      },
    ],
  };
}

function cartesianOptions(
  context: RenderContext,
  colors: string[],
  type: "column" | "areaspline",
): Record<string, unknown> {
  const { model } = context;
  const categories =
    model.categories ?? model.series[0]?.points?.map((point) => String(point.x)) ?? [];
  const muted = context.cssVar("--ark-text-muted", "#777");
  const border = context.cssVar("--ark-border", "#e5e5e5");

  return {
    ...baseOptions(context),
    colors,
    chart: { ...(baseOptions(context).chart as object), type },
    xAxis: {
      categories,
      lineColor: border,
      tickColor: border,
      labels: { style: { color: muted, fontSize: "10px" } },
    },
    yAxis: {
      title: { text: undefined },
      gridLineWidth: 0,
      labels: { style: { color: muted, fontSize: "10px" } },
    },
    plotOptions: {
      series: { animation: false },
      column: { stacking: "normal", borderWidth: 0, borderRadius: 2, maxPointWidth: 26 },
      areaspline: { fillOpacity: 0.12, marker: { enabled: false }, lineWidth: 2 },
    },
    series: model.series.map((series, index) => ({
      type,
      name: series.label ?? series.id,
      color: colors[index],
      data:
        series.points?.map((point) => (point.color ? { y: point.y, color: point.color } : point.y)) ??
        [series.value ?? 0],
    })),
  };
}

export const highchartsRenderer: ChartRenderer = {
  id: "highcharts",

  // No `gauge`: that one lives in `highcharts-more`, which the plugin does not
  // ship. Declining keeps the tile with Allure instead of drawing an empty box.
  supports: (model: ChartModel) =>
    model.kind === "pie" || model.kind === "bar" || model.kind === "line",

  render: async (context: RenderContext): Promise<RenderResult> => {
    const api = (await context.resolveLib("highcharts")) as HighchartsApi | undefined;
    if (!api?.chart) {
      return { families: [], renderedBy: "none", note: "highcharts is not installed" };
    }

    instances.get(context.host)?.destroy();
    context.host.replaceChildren();

    const colors = colorsOf(context);
    const options =
      context.model.kind === "pie"
        ? pieOptions(context, colors)
        : cartesianOptions(context, colors, context.model.kind === "bar" ? "column" : "areaspline");

    const instance = api.chart(context.host, {
      ...options,
      ...(context.options.option as Record<string, unknown> | undefined),
    });
    instances.set(context.host, instance);

    if (!observers.has(context.host) && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => instance.reflow());
      observer.observe(context.host);
      observers.set(context.host, observer);
    }

    return { families: familiesOf(context, colors, { marks: MARKS }), renderedBy: "highcharts" };
  },

  destroy: (host: HTMLElement) => {
    instances.get(host)?.destroy();
    instances.delete(host);
    observers.get(host)?.disconnect();
    observers.delete(host);
    host.replaceChildren();
  },
};
