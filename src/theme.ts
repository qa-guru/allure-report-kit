/**
 * Themes — token sets plus the report header configuration.
 *
 * Palette SSOT is `stacks/java-spring/tests/allure/pyramid-layers.json` in the
 * zero-design-system monorepo (checked by `scripts/pyramid_palette_sync.py`).
 * The values below are a pinned copy; `npm run sync:ds` refreshes them together
 * with the vendored design-system CSS.
 */
import type { KitThemeConfig, KitThemeHeaderConfig, KitTokens } from "./types.js";

/** Theme-independent chart swatches — same hexes as Allure 3 semantic.scss. */
const STATUS_TOKENS: KitTokens = {
  "--ark-status-failed": "#fd5a3e",
  "--ark-status-broken": "#ffd050",
  "--ark-status-skipped": "#aaaaaa",
  "--ark-status-unknown": "#b46fd8",
  "--ark-status-orange": "#ff8200",
  "--ark-status-passed": "#49cb68",
};

const LAYER_TOKENS_LIGHT: KitTokens = {
  "--ark-layer-unit": "#94ca66",
  "--ark-layer-component": "#ff8200",
  "--ark-layer-integration": "#7e22ce",
  "--ark-layer-api": "#e8bd00",
  "--ark-layer-e2e": "#dc2626",
  "--ark-layer-manual": "#459bde",
  "--ark-layer-other": "#64748b",
  "--ark-status-passed": "#3bc95d",
};

const LAYER_TOKENS_DARK: KitTokens = {
  "--ark-layer-unit": "#94ca66",
  "--ark-layer-component": "#ffa833",
  "--ark-layer-integration": "#a65ac4",
  "--ark-layer-api": "#ffd833",
  "--ark-layer-e2e": "#ff574f",
  "--ark-layer-manual": "#61b6fb",
  "--ark-layer-other": "#5d6876",
  "--ark-status-passed": "#49cb68",
};

/**
 * Ink drawn on top of a saturated band (pyramid tiers, filled bars).
 *
 * Surfaces, text and borders are deliberately absent from the theme: inside a
 * report they belong to the host, and `kit.css` maps them onto the report's own
 * tokens. A theme that repaints the chrome would fight Allure's light/dark.
 */
const BAND_INK_LIGHT: KitTokens = {
  "--ark-band-ink": "rgba(255, 255, 255, 0.92)",
};

const BAND_INK_DARK: KitTokens = {
  "--ark-band-ink": "rgba(28, 25, 23, 0.82)",
};

export const DEFAULT_HEADER: KitThemeHeaderConfig = {
  enabled: false,
  source: "design-system",
  syncReportTheme: true,
  lang: "ru",
};

/** QA Guru palette — locked pyramid + status colours, DS surfaces. */
export function qaGuru(overrides: Partial<KitThemeConfig> = {}): KitThemeConfig {
  const base: KitThemeConfig = {
    id: "qa-guru",
    mode: "auto",
    tokens: { ...STATUS_TOKENS },
    tokensLight: { ...LAYER_TOKENS_LIGHT, ...BAND_INK_LIGHT },
    tokensDark: { ...LAYER_TOKENS_DARK, ...BAND_INK_DARK },
    tile: { bar: true, indicators: true, indicatorMix: 100 },
    header: { ...DEFAULT_HEADER },
  };
  return mergeTheme(base, overrides);
}

/** Tokens only — no tile chrome, no header. For gradual adoption. */
export function tokensOnly(overrides: Partial<KitThemeConfig> = {}): KitThemeConfig {
  return mergeTheme(
    {
      id: "tokens-only",
      mode: "auto",
      tokens: { ...STATUS_TOKENS },
      tokensLight: { ...LAYER_TOKENS_LIGHT },
      tokensDark: { ...LAYER_TOKENS_DARK },
      tile: { bar: false, indicators: false },
      header: { ...DEFAULT_HEADER, enabled: false },
    },
    overrides,
  );
}

/**
 * DS header primitive in the report top bar.
 * Not `chrome.*`, not `custom.header` — the key is `theme.header`.
 */
export function header(config: KitThemeHeaderConfig = {}): KitThemeHeaderConfig {
  return { ...DEFAULT_HEADER, enabled: true, ...config };
}

export function mergeTheme(base: KitThemeConfig, overrides: Partial<KitThemeConfig>): KitThemeConfig {
  return {
    ...base,
    ...overrides,
    tokens: { ...base.tokens, ...overrides.tokens },
    tokensLight: { ...base.tokensLight, ...overrides.tokensLight },
    tokensDark: { ...base.tokensDark, ...overrides.tokensDark },
    tile: { ...base.tile, ...overrides.tile },
    header: { ...base.header, ...overrides.header },
  };
}

/** Serialize a theme into CSS text — used by the runtime and by the fork. */
export function themeToCss(theme: KitThemeConfig): string {
  const blocks: string[] = [];
  const emit = (selector: string, tokens: KitTokens | undefined): void => {
    const entries = Object.entries(tokens ?? {});
    if (entries.length === 0) {
      return;
    }
    const body = entries.map(([name, value]) => `  ${name}: ${value};`).join("\n");
    blocks.push(`${selector} {\n${body}\n}`);
  };

  // No `html` prefix: Allure marks the theme with a bare `[data-theme]`
  // attribute selector and may carry it on a wrapper rather than the root.
  emit(":root", theme.tokens);
  emit(':root, [data-theme="light"]', theme.tokensLight);
  emit('[data-theme="dark"]', theme.tokensDark);

  if (theme.tile?.indicatorMix !== undefined) {
    blocks.push(`.widget-tile {\n  --indicator-mix: ${theme.tile.indicatorMix}%;\n}`);
  }
  return blocks.join("\n\n");
}
