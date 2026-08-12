/**
 * @qa-guru/allure-report-kit — config-time API.
 *
 *   import { withKit, charts, panels, theme, renderers, presets } from "@qa-guru/allure-report-kit";
 *
 * Browser side lives behind the `/runtime` entry point.
 */
export * as charts from "./charts.js";
export * as panels from "./panels.js";
export * as theme from "./theme.js";
export * as renderers from "./renderers.js";
export * as presets from "./presets.js";

export { withKit, SOFT_FORK_IMPORTS } from "./with-kit.js";
export { DEFAULT_RENDERER, normalizeRenderer } from "./renderers.js";
export { PYRAMID_LAYERS } from "./presets.js";
export {
  overview,
  fromOverview,
  fromOverviewCharts,
  fromLead,
  matchesOverview,
  matchesLeadLayout,
  leadOffset,
  DEFAULT_OVERVIEW_PRESET,
} from "./presets.js";
export type {
  OverviewPreset,
  OverviewTileSpec,
  OverviewQualityGateSpec,
  FromOverviewOptions,
  FromLeadOptions,
  QualityGatePanelOverrides,
} from "./presets.js";
export { themeToCss } from "./theme.js";
export { STATUS_FAMILIES } from "./types.js";
export {
  CORNER_RATIO,
  TIER_GAP_RATIO,
  MAX_WIDTH_FRACTION,
  MIN_WIDTH_FRACTION,
  MIN_TIERS_FOR_HEIGHT,
  MAX_TIER_HEIGHT,
  MIN_BAND_WIDTH,
  tierGapPx,
  tierCornerRadius,
} from "./testing-pyramid-geometry.js";
export {
  LAYER_ORDER,
  OTHER_LAYER,
  STATUS_COLORS,
  STATUS_MAPPING,
  PYRAMID_COLORS_LIGHT,
  PYRAMID_COLORS_DARK,
  PYRAMID_COLORS,
  colorForLayer,
  isKnownLayer,
  type CollageTheme,
  type KnownLayer,
  type LayerKey,
  type StatusKey,
} from "./collage-palette.js";
export {
  QUALITY_GATE_FIXTURE_IDS,
  isKitQualityGateData,
  parseKitQualityGateData,
} from "./quality-gate/parse.js";
export type { QualityGateFixtureId } from "./quality-gate/parse.js";
export {
  buildQualityGateLayout,
  QUALITY_GATE_LAYOUT_METRICS,
  QUALITY_GATE_LAYOUT_TOKENS,
} from "./quality-gate/layout/index.js";
export type {
  BuildQualityGateLayoutOptions,
  QualityGateColorMix,
  QualityGateLayout,
  QualityGateLayoutBar,
  QualityGateLayoutBody,
  QualityGateLayoutFailedBody,
  QualityGateLayoutInfoFileSource,
  QualityGateLayoutInfoPopover,
  QualityGateLayoutInput,
  QualityGateLayoutMetrics,
  QualityGateLayoutPassedBody,
  QualityGateLayoutRuleRow,
  QualityGateLayoutTokens,
  QualityGatePaintColor,
  QualityGateTokenRef,
} from "./quality-gate/layout/index.js";

export type {
  AllureChartType,
  BuiltinRendererId,
  DiagnosticLevel,
  DotsSpec,
  KitChartTile,
  KitConfig,
  KitCustomPanel,
  KitDiagnostic,
  KitPanelData,
  KitPanelHistorySource,
  KitPanelQualityGateSource,
  KitPanelRunSource,
  KitPanelSource,
  KitQualityGateConfig,
  KitQualityGateData,
  KitQualityGateRule,
  KitTestsTableData,
  KitTestsTableHistoryPoint,
  KitTestsTableRow,
  QualityGateLabel,
  QualityGateLabels,
  KitPluginConfig,
  KitPluginOptions,
  KitRuntimeManifest,
  KitSeries,
  KitSeriesPoint,
  KitThemeConfig,
  KitThemeHeaderConfig,
  KitTile,
  KitTokens,
  HistoryMetric,
  PanelGroupBy,
  PanelKind,
  PanelMetric,
  RendererId,
  RendererRef,
  RendererSpec,
  ResolvedTile,
  StatusFamily,
  TileLayout,
  TileTier,
  TileType,
} from "./types.js";
