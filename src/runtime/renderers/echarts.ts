/**
 * ECharts renderer — page default for kit-owned tiles.
 *
 * ECharts is an optional peer: the library is resolved lazily, and a missing
 * install degrades to the registry fallback instead of throwing.
 */
import type { StatusFamily } from "../../types.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";
import { familyForColor, orderFamilies } from "../palette.js";

interface EChartsInstance {
  setOption: (option: Record<string, unknown>) => void;
  resize: () => void;
  dispose: () => void;
}

interface EChartsApi {
  init: (dom: HTMLElement, theme?: unknown, options?: Record<string, unknown>) => EChartsInstance;
  getInstanceByDom?: (dom: HTMLElement) => EChartsInstance | undefined;
}

const instances = new WeakMap<HTMLElement, EChartsInstance>();
const observers = new WeakMap<HTMLElement, ResizeObserver>();

function seriesColors(context: RenderContext): string[] {
  return context.model.series.map(
    (series, index) => series.color ?? context.cssVar(`--ark-series-${index}`, "#4b9bff"),
  );
}

function collectFamilies(context: RenderContext, colors: string[]): StatusFamily[] {
  const families = new Set<StatusFamily>();
  context.model.series.forEach((series, index) => {
    const family = series.family ?? familyForColor(colors[index]);
    if (family) {
      families.add(family);
    }
  });
  return orderFamilies(families);
}

function textStyle(context: RenderContext): Record<string, unknown> {
  return { color: context.cssVar("--ark-text", "#1c1917"), fontFamily: "inherit" };
}

function pieOption(context: RenderContext, colors: string[]): Record<string, unknown> {
  const { model } = context;
  const total =
    model.total ?? model.series.reduce((sum, series) => sum + (series.value ?? 0), 0);
  const primary = model.series[0]?.value ?? 0;
  const percentage = model.percentage ?? (total > 0 ? (primary / total) * 100 : 0);
  const muted = context.cssVar("--ark-text-muted", "rgba(28, 25, 23, 0.55)");

  return {
    color: colors,
    animation: false,
    tooltip: { trigger: "item" },
    title: {
      text: `${percentage.toFixed(2)}%`,
      subtext: model.unit ? `${model.unit} ${total}` : `из ${total}`,
      left: "center",
      top: "center",
      textStyle: { ...textStyle(context), fontSize: 26, fontWeight: 800 },
      subtextStyle: { color: muted, fontSize: 13 },
    },
    series: [
      {
        type: "pie",
        radius: ["72%", "88%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: false,
        padAngle: 3,
        itemStyle: { borderRadius: 9 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: false },
        data: model.series.map((series) => ({
          name: series.label ?? series.id,
          value: series.value ?? 0,
        })),
      },
    ],
  };
}

function barOption(context: RenderContext, colors: string[]): Record<string, unknown> {
  const { model } = context;
  const categories =
    model.categories ?? model.series[0]?.points?.map((point) => String(point.x)) ?? [];
  const axisLine = { lineStyle: { color: context.cssVar("--ark-border", "#e5e5e5") } };
  const axisLabel = { color: context.cssVar("--ark-text-muted", "#777"), fontSize: 10 };

  return {
    color: colors,
    animation: false,
    grid: { left: 34, right: 10, top: 12, bottom: 24 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: categories, axisLine, axisLabel },
    yAxis: { type: "value", axisLine, axisLabel, splitLine: { show: false } },
    series: model.series.map((series) => ({
      name: series.label ?? series.id,
      type: "bar",
      stack: "total",
      barMaxWidth: 26,
      itemStyle: { borderRadius: 2 },
      data: series.points?.map((point) => point.y) ?? [series.value ?? 0],
    })),
  };
}

function lineOption(context: RenderContext, colors: string[]): Record<string, unknown> {
  const { model } = context;
  const categories =
    model.categories ?? model.series[0]?.points?.map((point) => String(point.x)) ?? [];
  const axisLine = { lineStyle: { color: context.cssVar("--ark-border", "#e5e5e5") } };
  const axisLabel = { color: context.cssVar("--ark-text-muted", "#777"), fontSize: 10 };

  return {
    color: colors,
    animation: false,
    grid: { left: 40, right: 12, top: 14, bottom: 24 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", boundaryGap: false, data: categories, axisLine, axisLabel },
    yAxis: { type: "value", axisLine, axisLabel, splitLine: { show: false } },
    series: model.series.map((series) => ({
      name: series.label ?? series.id,
      type: "line",
      smooth: true,
      showSymbol: false,
      areaStyle: { opacity: 0.12 },
      lineStyle: { width: 2 },
      data: series.points?.map((point) => point.y) ?? [],
    })),
  };
}

function buildOption(context: RenderContext, colors: string[]): Record<string, unknown> {
  switch (context.model.kind) {
    case "pie":
      return pieOption(context, colors);
    case "bar":
      return barOption(context, colors);
    case "line":
      return lineOption(context, colors);
    default:
      return {};
  }
}

export const echartsRenderer: ChartRenderer = {
  id: "echarts",

  supports: (model: ChartModel) =>
    model.kind === "pie" || model.kind === "bar" || model.kind === "line",

  render: async (context: RenderContext): Promise<RenderResult> => {
    const api = (await context.resolveLib("echarts")) as EChartsApi | undefined;
    if (!api?.init) {
      return { families: [], renderedBy: "none", note: "echarts is not installed" };
    }

    instances.get(context.host)?.dispose();
    context.host.replaceChildren();

    const instance = api.init(context.host, undefined, {
      renderer: "svg",
      ...(context.options.init as Record<string, unknown> | undefined),
    });
    instances.set(context.host, instance);

    const colors = seriesColors(context);
    instance.setOption({
      ...buildOption(context, colors),
      ...(context.options.option as Record<string, unknown> | undefined),
    });

    if (!observers.has(context.host) && typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(context.host);
      observers.set(context.host, observer);
    }

    return { families: collectFamilies(context, colors), renderedBy: "echarts" };
  },

  destroy: (host: HTMLElement) => {
    instances.get(host)?.dispose();
    instances.delete(host);
    observers.get(host)?.disconnect();
    observers.delete(host);
    host.replaceChildren();
  },
};
