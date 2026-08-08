/**
 * DOM renderer — kit canon in HTML, no chart library.
 *
 * A table is not a chart, and no chart backend draws one: it is a panel kind
 * that needs rows, a header and an indicator per row. Keeping it a renderer
 * rather than a special case in the runtime preserves the contract that one tile
 * is drawn by exactly one registered renderer.
 *
 * The sibling of the `svg` canon: both belong to the kit, both work in a report
 * where no chart library was installed.
 */
import type { StatusFamily } from "../../types.js";
import type { ChartModel, ChartRenderer, RenderContext, RenderResult } from "../model.js";
import { familyForColor, orderFamilies } from "../palette.js";

function cell(tag: "td" | "th", text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) {
    node.className = className;
  }
  return node;
}

function renderTable(context: RenderContext): RenderResult {
  const { host, model } = context;
  const columns = model.columns ?? ["", ""];
  const families = new Set<StatusFamily>();

  const table = document.createElement("table");
  table.className = "ark-table";

  if (columns.some((column) => column !== "")) {
    const head = document.createElement("thead");
    const row = document.createElement("tr");
    for (const column of columns) {
      row.append(cell("th", column));
    }
    head.append(row);
    table.append(head);
  }

  const body = document.createElement("tbody");

  for (const series of model.series) {
    const row = document.createElement("tr");
    const label = cell("td", series.label ?? series.id, "ark-table__label");
    const family = series.family ?? familyForColor(series.color);

    if (family) {
      families.add(family);
      const dot = document.createElement("span");
      dot.className = `indicator indicator--status-${family}`;
      label.prepend(dot);
    }

    row.append(label);
    row.append(
      cell(
        "td",
        series.value === undefined
          ? ""
          : (model.formatValue?.(series.value) ?? String(series.value)),
        "ark-table__value",
      ),
    );
    body.append(row);
  }

  table.append(body);

  const scroll = document.createElement("div");
  scroll.className = "ark-table-scroll";
  scroll.append(table);
  host.replaceChildren(scroll);

  return { families: orderFamilies(families), renderedBy: "dom" };
}

export const domRenderer: ChartRenderer = {
  id: "dom",
  supports: (model: ChartModel) => model.kind === "table",
  render: async (context) => renderTable(context),
  destroy: (host) => host.replaceChildren(),
};
