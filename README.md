# @qa-guru/allure-report-kit

DX kit for **Allure Report 3**: a theme, pluggable chart renderers, custom
panels with bar indicators, and a real design-system header on top of the
report.

> v0.1 — works inside a real generated Allure 3 report. Nothing is published to
> npm yet; the packages resolve through `file:` links. See `soft-fork/README.md`.

## Why

Stock Allure 3 lets you set a `logo` and a `light | dark | auto` theme. Anything
beyond that used to mean injecting CSS into hashed module classes
(`[class*="styles_grid__"]`) and post-processing rendered SVG. That breaks on
minor upgrades, cannot add a widget type, and cannot change how a single tile is
drawn.

The kit forks only the UI slice of Allure 3 and replaces the chart dispatch with
a renderer registry.

## Install

```bash
npm i -D @qa-guru/allure-report-kit
# pick the backends you actually use — all optional peers
npm i -D echarts highcharts
```

## Usage

```js
import { withKit, charts, panels, presets, renderers, theme } from "@qa-guru/allure-report-kit";

export default withKit({
  name: "Reference App Tests",
  historyPath: "./history.jsonl",
  renderer: renderers.echarts(),
  softFork: true,

  theme: theme.qaGuru({
    header: theme.header({ productName: "Reference App" }),
  }),

  plugins: {
    awesome: {
      options: {
        charts: [
          ...presets.lockedQuad({ renderers: { durations: "highcharts" } }),
          panels.custom({
            id: "servicesCurrentStatus",
            title: "Текущий статус по сервисам",
            renderer: "highcharts",
            dots: "fromSeries",
          }),
          charts.testResultSeverities({ renderer: "stock" }),
        ],
      },
    },
  },
});
```

Full example: `examples/minimal/allurerc.mjs`.

## API

| Export | Purpose |
|--------|---------|
| `withKit(config)` | Wraps an Allure 3 config: resolves renderers, writes the `options.kit` manifest, reports diagnostics |
| `charts.*` | Typed builders for all 13 upstream chart types |
| `panels.custom / donut / bar / line / pyramid` | Kit-owned widget types |
| `theme.qaGuru / tokensOnly / header` | Token sets and the report header |
| `renderers.stock / echarts / highcharts / amcharts / svg` | Renderer specs (inert data) |
| `presets.lockedQuad / isLockedQuad` | The ADR 006 first screen |
| `@qa-guru/allure-report-kit/runtime` | Browser side: `createKitRuntime`, tile shell, registry, `mountReportHeader` |

## Renderers

| id | Backend | Draws | Notes |
|----|---------|-------|-------|
| `stock` (alias `nivo`) | Allure's own widget | everything | upstream draws it |
| `echarts` | Apache ECharts | pie, bar, line, treemap, heatmap | page default, Apache-2.0 |
| `highcharts` | Highcharts | pie, bar, line | commercial licence is yours to hold |
| `amcharts` | amCharts 5 | pie | adapter + spike; needs bundling, draws a stub otherwise |
| `svg` | none | pyramid | kit canon |

Rules: a page may mix renderers freely, **one tile is drawn by exactly one
renderer**, and a backend that cannot draw a given kind never claims the tile —
inside a report it stays on Allure's own widget.

Models are backend-agnostic, one branch per **data shape** rather than per
(chart type × library) pair, which is what covers all 13 upstream chart types
without a combinatorial explosion of adapters.

Adding a backend means implementing one interface — chart models are
backend-agnostic, so there is no per-(chart × library) adapter:

```ts
import { createKitRuntime } from "@qa-guru/allure-report-kit/runtime";

const runtime = createKitRuntime({
  renderers: [
    {
      id: "plotly",
      supports: (model) => model.kind === "bar",
      render: async ({ host, model, resolveLib }) => {
        const plotly = await resolveLib("plotly");
        /* draw */
        return { families: ["green"], renderedBy: "plotly" };
      },
    },
  ],
});
```

## Custom panels and indicators

A panel is a first-class tile, not a decorated stock widget. Its shell is the
design-system `widget-tile`: `__bar` (indicators + title) and `__body` (chart).

`dots` decides what appears in the bar:

| Value | Result |
|-------|--------|
| `"fromSeries"` (default) | only the status families really drawn |
| `["red", "green"]` | that fixed set |
| `false` | no indicator row at all |

Families always render in one order: red, orange, yellow, purple, gray, green,
blue. These are **not** the three macOS traffic-lights of the design-system
`panel__dots` — a different primitive.

Stock Allure 3 skips unknown chart types (`generateChartData` ends in
`default: break`), so a config with panels still loads without the fork — the
panel simply does not appear, and `withKit` says so.

## Locked 2×2

`presets.lockedQuad()` emits the first-screen invariant of the monorepo
(ADR 006) and nothing else:

```
[0] currentStatus (pie)   [1] durationDynamics
[2] testingPyramid        [3] durations (groupBy: layer)
```

Renderers are free, the order is not. Validation belongs to the monorepo:

```bash
node generators/ethalon/tests-java/scripts/validate-allurerc.mjs \
  projects/allure-report-kit-home/allure-report-kit/examples/minimal/allurerc.mjs
```

## `theme.header`

`theme.header` mounts the design-system header above the report — the shared
primitive, not a copy of a consumer app's header. The report is pushed down by
the band's *measured* height, so Allure's own section switcher stays reachable.

The theme is mirrored **both ways** (`html.theme-light` ↔ `html[data-theme]`),
so the two switches — the header's and Allure's own — never disagree, and the
header's icon follows a change it did not initiate.

Not supported with `singleFile: true` — the plugin falls back to stock Allure
and says so.

The design-system stays the source of truth; the pinned copy under
`src/theme/vendor/design-system/` is refreshed mechanically:

```bash
npm run sync:ds           # update from the monorepo design-system
npm run sync:ds -- --check  # CI: fail when the copy is stale
```

## Theme and the host

The kit theme owns the **chart palette** — status and layer colours are a locked
canon. The **chrome** (surfaces, text, borders) belongs to the host: `kit.css`
declares it in a cascade layer that resolves to Allure's own tokens, so a tile
follows the report's light/dark instead of repainting it. Standalone pages add
the design-system layer back with `@qa-guru/allure-report-kit/theme/standalone.css`.

Canvas backends read CSS custom properties once, at draw time, so
`runtime.observeTheme()` redraws tiles when the theme flips.

## Development

Fresh clone:

```bash
npm run setup          # installs and builds every package in dependency order
```

The packages are linked with `file:` rather than an npm workspace root, because
each forked bundle carries its own large upstream tree — so install order
matters and `setup` owns it.

```bash
npm run build          # tsc → dist/
npm test               # node --test
npm run sync:ds        # refresh vendored design-system primitives
npm run verify         # build + unit tests + dogfood smoke

npm run build:fork     # webpack → packages/web-{awesome,dashboard}/dist
npm run verify:report  # build + forks + real reports + report smoke
```

Two levels of proof:

| | What it proves | Stand |
|---|---|---|
| `dogfood/` | renderers, panels, indicators, DS header — standalone | `ensure.py ark-dogfood` → :3021 |
| `e2e/` | the soft-fork inside generated Awesome **and** Dashboard reports | `ensure.py ark-report` → :3024 |

`e2e/` builds its own deterministic fixture (18 tests over six layers, three runs
so history exists), so it depends on nobody's build output.

## Licences

The kit is Apache-2.0 and ships no chart library code. ECharts is Apache-2.0.
Highcharts and amCharts 5 are proprietary: obtain and hold your own licence.
No licence key belongs in this repository.
