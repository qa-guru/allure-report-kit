export const OVERVIEW_PRESET: {
  id: string;
  qualityGates: ReadonlyArray<{ id: string; layout?: string }>;
  tiles: ReadonlyArray<{
    chart: string;
    limit?: number;
    groupBy?: string;
    layersKey?: string;
  }>;
  renderers: Record<string, string>;
  titles: Record<string, string>;
  pyramidLayers: readonly string[];
};
