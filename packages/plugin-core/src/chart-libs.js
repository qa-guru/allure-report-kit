import { createRequire } from "node:module";
import { join } from "node:path";
import { cwd } from "node:process";

import { CHART_LIBS } from "./constants.js";

const require = createRequire(import.meta.url);

/**
 * Resolve a chart library from the *consumer's* install, never from the kit.
 * Highcharts and amCharts are proprietary: the report may embed them because
 * the user holds the licence, the kit must not redistribute them.
 */
export function resolveChartLib(name, resolveFrom) {
  const lib = CHART_LIBS[name];
  if (!lib) {
    return undefined;
  }
  const consumerRequire = createRequire(join(cwd(), "index.js"));
  for (const resolver of [consumerRequire, resolveFrom, require]) {
    try {
      return { ...lib, path: resolver.resolve(lib.specifier) };
    } catch {
      /* try the next resolution root */
    }
  }
  return undefined;
}

export function requiredLibs(tiles, resolveFrom) {
  const ids = new Set(tiles.map((tile) => tile.renderer?.id).filter(Boolean));
  const resolved = [];
  const missing = [];

  for (const id of ids) {
    if (!CHART_LIBS[id]) {
      if (id === "amcharts") {
        missing.push("amcharts (needs a prebuilt bundle — see PLAN-0.1)");
      }
      continue;
    }
    const lib = resolveChartLib(id, resolveFrom);
    if (lib) {
      resolved.push({ id, ...lib });
    } else {
      missing.push(`${id} (npm i -D ${id})`);
    }
  }
  return { resolved, missing };
}
