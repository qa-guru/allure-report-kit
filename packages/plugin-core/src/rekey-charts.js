/**
 * Re-key one section of `charts.json` onto the manifest's stable chart ids.
 *
 * Upstream walks the tile list in order and calls `generateUuid()` for each
 * entry, dropping the ones whose type it does not know (custom panels). So the
 * n-th generated entry belongs to the n-th chart tile, and doing that walk here —
 * with both the config and the result in hand — is what lets the browser stop
 * guessing. A type mismatch means the assumption broke: the entry keeps its
 * original key and stays with Allure rather than being handed the wrong tile.
 */
export function rekeyChartSection(section, tiles) {
  const chartTiles = tiles.filter((tile) => !tile.panel && tile.chartId);
  if (chartTiles.length === 0) {
    return { section, mismatched: [] };
  }
  const entries = Object.entries(section);
  const result = {};
  const mismatched = [];

  entries.forEach(([originalId, chartData], index) => {
    const tile = chartTiles[index];
    if (tile && chartData?.type === tile.type) {
      result[tile.chartId] = chartData;
      return;
    }
    if (tile) {
      mismatched.push(`${tile.chartId} expected ${tile.type}, widget has ${chartData?.type}`);
    }
    result[originalId] = chartData;
  });

  return { section: result, mismatched };
}
