/**
 * Presets — ready tile groups.
 *
 * `lockedQuad()` reproduces the "first screen" invariant of ADR 006:
 *   [0] currentStatus  [1] durationDynamics
 *   [2] testingPyramid [3] durations (groupBy: layer)
 *
 * The invariant itself lives in the monorepo ethalon and is checked by
 * `generators/ethalon/tests-java/scripts/validate-allurerc.mjs`. The kit does
 * not own it and does not ship a second validator — it just never emits the
 * quad in another order.
 */
import * as charts from "./charts.js";
import type { KitChartTile, RendererRef } from "./types.js";

/** Canon layer order, bottom to top. No `visual` layer — see ADR 006. */
export const PYRAMID_LAYERS = [
  "unit",
  "component",
  "integration",
  "api",
  "e2e",
  "manual",
] as const;

export type LockedQuadSlot = "currentStatus" | "durationDynamics" | "testingPyramid" | "durations";

export interface LockedQuadOptions {
  layers?: string[];
  limit?: number;
  titles?: Partial<Record<LockedQuadSlot, string>>;
  renderers?: Partial<Record<LockedQuadSlot, RendererRef>>;
  filter?: (testResult: unknown) => boolean;
}

const DEFAULT_TITLES: Record<LockedQuadSlot, string> = {
  currentStatus: "Текущий статус",
  durationDynamics: "Динамика длительности",
  testingPyramid: "Пирамида тестирования",
  durations: "Длительности по layer",
};

export function lockedQuad(options: LockedQuadOptions = {}): KitChartTile[] {
  const { layers = [...PYRAMID_LAYERS], limit = 20, titles = {}, renderers = {}, filter } = options;
  const title = (slot: LockedQuadSlot): string => titles[slot] ?? DEFAULT_TITLES[slot];

  return [
    charts.currentStatus({
      title: title("currentStatus"),
      renderer: renderers.currentStatus,
      filter,
    }),
    charts.durationDynamics({
      title: title("durationDynamics"),
      limit,
      renderer: renderers.durationDynamics,
      filter,
    }),
    charts.testingPyramid({
      title: title("testingPyramid"),
      layers,
      renderer: renderers.testingPyramid ?? "svg",
      filter,
    }),
    charts.durations({
      title: title("durations"),
      groupBy: "layer",
      renderer: renderers.durations,
      filter,
    }),
  ];
}

/** True when the first four tiles satisfy the ADR 006 invariant. */
export function isLockedQuad(tiles: readonly unknown[]): boolean {
  const type = (index: number): string | undefined =>
    (tiles[index] as { type?: string } | undefined)?.type;
  const groupBy = (index: number): string | undefined =>
    (tiles[index] as { groupBy?: string } | undefined)?.groupBy;

  return (
    tiles.length >= 4 &&
    type(0) === "currentStatus" &&
    type(1) === "durationDynamics" &&
    type(2) === "testingPyramid" &&
    type(3) === "durations" &&
    groupBy(3) === "layer"
  );
}
