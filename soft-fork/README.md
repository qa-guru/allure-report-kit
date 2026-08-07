# Soft-fork — UI slice of Allure 3

Not a fork of `allure-framework/allure3`. Only the UI slice is forked; the
engine (`core`, `reader`, `charts-api`) stays a pinned upstream dependency.

| Package | Upstream | Kit |
|---------|----------|-----|
| plugin (Awesome) | `@allurereport/plugin-awesome` | `@qa-guru/allure-report-kit-awesome` |
| plugin (Dashboard) | `@allurereport/plugin-dashboard` | `@qa-guru/allure-report-kit-dashboard` |
| web bundle | `@allurereport/web-awesome`, `@allurereport/web-dashboard` | forked `src/`, kit registry wired in |
| engine | `@allurereport/core`, `reader`, `charts-api`, `web-commons` | upstream, pinned |

`withKit({ softFork: true })` rewrites `plugins.awesome.import` /
`plugins.dashboard.import` to the kit packages. An explicit `import` set by the
user is never overwritten.

## The seam

Upstream `web-awesome/src/components/Charts/index.tsx` dispatches chart data to
a widget with a `switch` over `ChartType`:

```tsx
const getChartWidgetByType = (chartData: UIChartData, { t }) => {
  switch (chartData.type) {
    case ChartType.CurrentStatus:
      return <CurrentStatusChartWidget … />;
    // 13 cases, one per upstream chart type
  }
};
```

Three things are impossible there: replacing the renderer of a single tile,
adding a kit-owned tile type, and reusing the design-system tile chrome. The
kit replaces that one function — see `Charts.kit.tsx` in this folder — with a
registry lookup that keeps every untouched tile on the upstream widget.

Everything else in the fork is upstream code. That is the whole point: the
smaller the delta, the cheaper the version sync.

## Upstream sync

Pinned at `@allurereport/* 3.13.x` (shipped by `allure@3.14.3`).

1. `git diff upstream/main -- packages/web-awesome/src` — expect the delta to be
   the seam file, the manifest reader and the theme entry point.
2. Re-check `ChartType` in `@allurereport/charts-api`: a new member means a new
   `toChartModel` branch, not a new switch case.
3. Re-check the props of the widgets in `@allurereport/web-components`; the
   stock path forwards them verbatim.
4. `npm run sync:ds` in the kit — design-system primitives may have moved.
5. Rebuild the dogfood and run `scripts/smoke-dogfood.mjs`.

## Status in v0.1

The seam, the registry, the models, the tile shell and the renderers are
implemented and proven by the dogfood page, which consumes exactly the manifest
`withKit` produces. What is not done yet: the forked packages are not published,
so `softFork: true` currently points at names that only exist locally. Wiring
them is the first item of `PLAN-0.1.md`.
