/**
 * ECharts renderer — page default for kit-owned tiles.
 *
 * ECharts is an optional peer: the library is resolved lazily, and a missing
 * install degrades to the registry fallback instead of throwing.
 */
import type { StatusFamily } from "../../types.js";
import { familiesOf } from "../families.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";
import { orderFamilies } from "../palette.js";

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

/**
 * Data marks of the ECharts SVG output.
 *
 * Axis lines, split lines and the line of a line chart all carry `fill="none"`,
 * so filling is what separates a mark from the chart furniture; labels are
 * `<text>` and never match.
 */
const MARKS = 'path[fill]:not([fill="none"]):not([fill="transparent"]), rect[fill]:not([fill="none"])';

function seriesColors(context: RenderContext): string[] {
  return context.model.series.map(
    (series, index) => series.color ?? context.cssVar(`--ark-series-${index}`, "#4b9bff"),
  );
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
      data:
        series.points?.map((point) =>
          point.color ? { value: point.y, itemStyle: { color: point.color } } : point.y,
        ) ?? [series.value ?? 0],
    })),
  };
}

/**
 * Progress gauge — `series[0].value` against `model.total`.
 *
 * Deliberately plain: the tile bar already carries the title and the dots, so
 * the gauge only owns the arc and the number inside it.
 */
function gaugeOption(context: RenderContext, colors: string[]): Record<string, unknown> {
  const { model } = context;
  const primary = model.series[0];
  const value = primary?.value ?? 0;
  const total = model.total ?? 100;
  const muted = context.cssVar("--ark-text-muted", "rgba(28, 25, 23, 0.55)");

  return {
    animation: false,
    series: [
      {
        type: "gauge",
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: total,
        radius: "94%",
        center: ["50%", "62%"],
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        progress: {
          show: true,
          width: 16,
          roundCap: true,
          itemStyle: { color: colors[0] ?? context.cssVar("--ark-status-passed", "#49cb68") },
        },
        axisLine: {
          roundCap: true,
          lineStyle: { width: 16, color: [[1, context.cssVar("--ark-border", "#e5e5e5")]] },
        },
        detail: {
          offsetCenter: [0, "-8%"],
          formatter: model.formatValue ? (raw: number) => model.formatValue?.(raw) : "{value}",
          color: context.cssVar("--ark-text", "#1c1917"),
          fontSize: 26,
          fontWeight: 800,
        },
        title: { offsetCenter: [0, "26%"], color: muted, fontSize: 12 },
        data: [{ value, name: model.unit ? `${model.unit} ${total}` : `из ${total}` }],
      },
    ],
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
    case "gauge":
      return gaugeOption(context, colors);
    default:
      return {};
  }
}

export const echartsRenderer: ChartRenderer = {
  id: "echarts",

  supports: (model: ChartModel) => model.kind !== "pyramid" && model.kind !== "table",

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
    return {
      families: familiesOf(context, colors, { marks: MARKS }),
      renderedBy: "echarts",
    };
  },

  destroy: (host: HTMLElement) => {
    instances.get(host)?.dispose();
    instances.delete(host);
    observers.get(host)?.disconnect();
    observers.delete(host);
    host.replaceChildren();
  },
};
