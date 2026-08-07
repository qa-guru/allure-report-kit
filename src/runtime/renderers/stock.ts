/**
 * Stock renderer — the upstream Allure 3 widget (nivo under the hood).
 *
 * Inside the soft-fork the kit calls `createStockRenderer(mount)` with a mount
 * function that renders the original Preact widget, so `renderer: "stock"`
 * means literally "leave this tile to Allure".
 *
 * Standalone (dogfood, tests) there is no Allure app around, so the default
 * export draws an explicit placeholder rather than pretending to be nivo. It is
 * also the registry fallback: a tile whose renderer is unavailable lands here
 * with a note instead of throwing.
 */
import type { ChartRenderer, RenderContext, RenderResult } from "../model.js";

export type StockMount = (context: RenderContext) => void | Promise<void>;

export function createStockRenderer(mount: StockMount): ChartRenderer {
  return {
    id: "stock",
    supports: () => true,
    render: async (context) => {
      await mount(context);
      return { families: [], renderedBy: "stock" };
    },
    destroy: (host) => host.replaceChildren(),
  };
}

function placeholder(context: RenderContext): RenderResult {
  const box = document.createElement("div");
  box.className = "ark-stub";
  box.dataset.renderer = "stock";

  const title = document.createElement("span");
  title.className = "ark-stub__title";
  title.textContent = "stock (nivo)";

  const note = document.createElement("span");
  note.className = "ark-stub__note";
  note.textContent = "рисует Allure — доступно внутри soft-fork";

  box.append(title, note);
  context.host.replaceChildren(box);

  return { families: [], renderedBy: "stock-placeholder" };
}

export const stockRenderer: ChartRenderer = {
  id: "stock",
  supports: () => true,
  render: async (context) => placeholder(context),
  destroy: (host) => host.replaceChildren(),
};
