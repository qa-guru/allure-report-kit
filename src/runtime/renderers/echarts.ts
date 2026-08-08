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

function observeResize(host: HTMLElement, instance: EChartsInstance): void {
  if (observers.has(host) || typeof ResizeObserver === "undefined") {
    return;
  }
  const observer = new ResizeObserver(() => instance.resize());
  observer.observe(host);
  observers.set(host, observer);
}

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

/**
 * Quality ramp for 0..1 scores: failed → broken → passed.
 *
 * Read from the theme at draw time rather than hardcoded, so a treemap follows
 * the same palette as the donut next to it.
 */
function qualityRamp(context: RenderContext): (score: number) => string {
  const stops = [
    { at: 0, color: context.cssVar("--ark-status-failed", "#fd5a3e") },
    { at: 0.5, color: context.cssVar("--ark-status-broken", "#ffd050") },
    { at: 1, color: context.cssVar("--ark-status-passed", "#49cb68") },
  ];
  return (score) => {
    const clamped = Math.min(Math.max(score, 0), 1);
    const stop = stops.reduce((best, candidate) =>
      Math.abs(candidate.at - clamped) < Math.abs(best.at - clamped) ? candidate : best,
    );
    return stop.color;
  };
}

function familiesForScores(scores: number[]): StatusFamily[] {
  const families = new Set<StatusFamily>();
  for (const score of scores) {
    families.add(score >= 0.75 ? "green" : score >= 0.4 ? "yellow" : "red");
  }
  return orderFamilies(families);
}

interface TreeNode {
  id: string;
  value?: number;
  colorValue?: number;
  children?: TreeNode[];
}

function treemapOption(context: RenderContext): {
  option: Record<string, unknown>;
  scores: number[];
} {
  const ramp = qualityRamp(context);
  const scores: number[] = [];

  const convert = (node: TreeNode): Record<string, unknown> => {
    const children = node.children?.map(convert);
    if (node.colorValue !== undefined) {
      scores.push(node.colorValue);
    }
    return {
      name: node.id,
      ...(node.value === undefined ? {} : { value: node.value }),
      ...(children?.length ? { children } : {}),
      ...(node.colorValue === undefined ? {} : { itemStyle: { color: ramp(node.colorValue) } }),
    };
  };

  const root = context.model.tree as TreeNode | undefined;
  const data = root?.children?.map(convert) ?? (root ? [convert(root)] : []);

  return {
    scores,
    option: {
      animation: false,
      tooltip: { trigger: "item" },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          top: 4,
          left: 4,
          right: 4,
          bottom: 4,
          itemStyle: { borderColor: context.cssVar("--ark-surface", "#fff"), borderWidth: 2, gapWidth: 2 },
          label: {
            show: true,
            fontSize: 11,
            color: context.cssVar("--ark-band-ink", "rgba(255,255,255,0.92)"),
          },
          upperLabel: { show: false },
          levels: [{ itemStyle: { gapWidth: 3 } }, { itemStyle: { gapWidth: 1 } }],
          data,
        },
      ],
    },
  };
}

function heatmapOption(context: RenderContext): {
  option: Record<string, unknown>;
  scores: number[];
} {
  const { model } = context;
  const columns = model.categories ?? [];
  const rows = model.series.map((series) => series.label ?? series.id);
  const ramp = qualityRamp(context);
  const scores: number[] = [];

  const cells = model.series.flatMap((series, rowIndex) =>
    (series.points ?? []).map((point) => {
      const columnIndex = columns.indexOf(String(point.x));
      scores.push(1 - point.y);
      return {
        value: [columnIndex, rowIndex, point.y],
        itemStyle: { color: ramp(1 - point.y) },
      };
    }),
  );

  const axisLabel = { color: context.cssVar("--ark-text-muted", "#777"), fontSize: 10 };

  return {
    scores,
    option: {
      animation: false,
      grid: { left: 90, right: 12, top: 12, bottom: 30 },
      tooltip: {
        formatter: (params: { value: [number, number, number] }) =>
          `${rows[params.value[1]]} · ${columns[params.value[0]]}: ${
            model.formatValue?.(params.value[2]) ?? params.value[2]
          }`,
      },
      xAxis: { type: "category", data: columns, axisLabel, splitArea: { show: true } },
      yAxis: { type: "category", data: rows, axisLabel, splitArea: { show: true } },
      series: [
        {
          type: "heatmap",
          data: cells,
          label: {
            show: true,
            fontSize: 10,
            color: context.cssVar("--ark-band-ink", "rgba(255,255,255,0.92)"),
            formatter: (params: { value: [number, number, number] }) =>
              model.formatValue?.(params.value[2]) ?? String(params.value[2]),
          },
        },
      ],
    },
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

  supports: (model: ChartModel) => model.kind !== "pyramid",

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

    // Score-driven charts colour themselves from the quality ramp, so their
    // families come from the drawn values rather than from series colours.
    if (context.model.kind === "treemap" || context.model.kind === "heatmap") {
      const built =
        context.model.kind === "treemap" ? treemapOption(context) : heatmapOption(context);
      instance.setOption({
        ...built.option,
        ...(context.options.option as Record<string, unknown> | undefined),
      });
      observeResize(context.host, instance);
      return { families: familiesForScores(built.scores), renderedBy: "echarts" };
    }

    const colors = seriesColors(context);
    instance.setOption({
      ...buildOption(context, colors),
      ...(context.options.option as Record<string, unknown> | undefined),
    });

    observeResize(context.host, instance);
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
