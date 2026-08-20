# Changelog

## Unreleased

### English

- **testingPyramid** — tier width follows test count (peak layer fills the funnel). Stack order is still unit→…→e2e; the shape is a chart, not a decorative cone.

### Russian

- **testingPyramid** — ширина яруса по числу тестов (максимум заполняет воронку). Порядок слоёв прежний; форма — график, не декоративный конус.

## v0.3.5 — 2026-08-14

### English

- **quality-gate info** — paint the JSON popover with DOM nodes (`textContent`), not `innerHTML`.
- **fixtures** — Sonar demo `projectKey` / dashboard URLs match the live backend key.

### Russian

- **quality-gate info** — JSON в popover через DOM, без `innerHTML`.
- **fixtures** — demo Sonar `projectKey` совпадает с живым backend.

## v0.3.4 — 2026-08-14

### English

- **testsTable** — widen the Status column (~+100px from Test on 2×2 dashboard tiles) so RU/EN badges (`ПРОЙДЕН` / `PASSED`) are not ellipsized. Soft-forks **3.14.3-6**.

### Russian

- **testsTable** — колонка «Статус» шире (~+100px за счёт «Тест» на тайле 2×2), бейджи `ПРОЙДЕН` / `УПАЛ` / `СЛОМАН` без обрезки. Форки **3.14.3-6**.

## v0.3.3 — 2026-08-12

### English

- **`@qa-guru/allure-report-kit/collage`** — publishable pin for collage `STATUS_COLORS`, layer hexes (`PYRAMID_COLORS_*`), and testing-pyramid tier geometry (`CORNER_RATIO`, `TIER_GAP_RATIO`, helpers).
- Replaces removed `@qa-guru/allure-notifications-pyramid`; SSOT hex remains `pyramid-layers.json` in zero-design-system monorepo.

### Russian

- **`/collage`** — publishable pin для collage-палитры и геометрии testing pyramid; заменяет удалённый `@qa-guru/allure-notifications-pyramid`.
