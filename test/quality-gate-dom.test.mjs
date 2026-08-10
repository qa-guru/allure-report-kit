/**
 * Quality-gate layout IR → DOM paint (T3 adapter).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Window } from "happy-dom";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "quality-gate-dom",
  story: "layout IR → DOM paint",
  layer: "unit",
  severity: "normal",
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "fixtures/quality-gate");

const FIXTURE_IDS = ["aqg-passed", "aqg-failed", "sqg-passed", "sqg-failed", "sqg-long"];

function loadFixture(id) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, `${id}.json`), "utf8"));
}

async function withDomWindow(fn) {
  const window = new Window();
  const globals = globalThis;
  const previous = {
    window: globals.window,
    document: globals.document,
    HTMLElement: globals.HTMLElement,
    Node: globals.Node,
  };

  globals.window = window;
  globals.document = window.document;
  globals.HTMLElement = window.HTMLElement;
  globals.Node = window.Node;

  try {
    return await fn(window);
  } finally {
    globals.window = previous.window;
    globals.document = previous.document;
    globals.HTMLElement = previous.HTMLElement;
    globals.Node = previous.Node;
    window.close();
  }
}

async function renderFixture(id) {
  return withDomWindow(async (window) => {
    const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
    const { buildQualityGateLayout } = await import("../dist/quality-gate/layout/index.js");
    const { paintQualityGateLayout } = await import("../dist/runtime/quality-gate-render.js");

    const data = parseKitQualityGateData(loadFixture(id));
    const layout = buildQualityGateLayout(data);
    const host = window.document.createElement("div");
    paintQualityGateLayout(host, layout);
    return { host, layout, data };
  });
}

test("fixture → layout → DOM preserves quality-gate chrome contract", async () => {
  for (const id of FIXTURE_IDS) {
    const { host, layout, data } = await renderFixture(id);

    assert.equal(host.hidden, false, id);
    const root = host.querySelector(".quality-gate");
    assert.ok(root, `${id}: root missing`);

    assert.equal(root.dataset.testid, layout.testId, id);
    assert.equal(root.getAttribute("aria-label"), layout.ariaLabel, id);
    assert.ok(
      root.classList.contains(`quality-gate--${layout.kind}`),
      `${id}: kind class`,
    );
    assert.ok(
      root.classList.contains(layout.passed ? "quality-gate--passed" : "quality-gate--failed"),
      `${id}: status class`,
    );

    const barTitle = root.querySelector(".quality-gate__bar-title");
    assert.equal(barTitle?.textContent, layout.bar.title, id);

    const indicator = root.querySelector(".quality-gate__bar .indicator");
    assert.ok(
      indicator?.classList.contains(`indicator--${layout.bar.indicatorStatus}`),
      `${id}: indicator status`,
    );
    assert.ok(indicator?.classList.contains("indicator--solid"), `${id}: solid indicator`);

    if (layout.bar.info.enabled) {
      assert.ok(root.querySelector('[data-testid="qg-info"]'), `${id}: info popover`);
    } else {
      assert.equal(root.querySelector('[data-testid="qg-info"]'), null, `${id}: no info`);
    }

    if (layout.body.mode === "passed") {
      const verdict = root.querySelector(".quality-gate__verdict--ok");
      assert.equal(verdict?.textContent, layout.body.verdict, id);
      assert.equal(root.querySelector(".quality-gate__rules"), null, `${id}: no rules on pass`);
    } else {
      const items = root.querySelectorAll(".quality-gate__rule");
      assert.equal(items.length, layout.body.rows.length, id);
      layout.body.rows.forEach((row, index) => {
        const item = items[index];
        assert.equal(item.querySelector(".quality-gate__rule-id")?.textContent, row.id, `${id}:${row.id}`);
        assert.equal(item.querySelector(".quality-gate__message")?.textContent, row.message, `${id}:${row.id}`);
        const formula = item.querySelector(".quality-gate__formula");
        if (row.formula) {
          assert.equal(formula?.textContent, row.formula, `${id}:${row.id}:formula`);
        } else {
          assert.equal(formula, null, `${id}:${row.id}:no-formula`);
        }
      });
    }

    assert.equal(layout.passed, data.passed, id);
  }
});

test("renderQualityGateHost matches paintQualityGateLayout path", async () => {
  await withDomWindow(async (window) => {
    const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
    const { renderQualityGateHost } = await import("../dist/runtime/quality-gate-render.js");

    const data = parseKitQualityGateData(loadFixture("aqg-failed"));
    const host = window.document.createElement("div");
    const shown = renderQualityGateHost(host, data);
    assert.equal(shown, true);

    const root = host.querySelector(".quality-gate");
    assert.ok(root);
    assert.equal(root.dataset.testid, "quality-gate");
    assert.equal(root.querySelectorAll(".quality-gate__rule").length, 2);
  });
});

test("dogfood-like data without config still paints info chrome", async () => {
  await withDomWindow(async (window) => {
    const { buildQualityGateLayout } = await import("../dist/quality-gate/layout/index.js");
    const { paintQualityGateLayout } = await import("../dist/runtime/quality-gate-render.js");

    const layout = buildQualityGateLayout({
      passed: false,
      rules: [
        {
          id: "maxFailures",
          message: "The number of failed tests 3 exceeds the allowed threshold value 0",
          passed: false,
          actual: 3,
          expected: 0,
        },
      ],
      barTitle: "Allure Quality Gate",
      lang: "ru",
    });
    const host = window.document.createElement("div");
    paintQualityGateLayout(host, layout);

    const root = host.querySelector(".quality-gate");
    assert.ok(root?.querySelector('[data-testid="qg-info"]'));
    const title = root?.querySelector(".quality-gate__bar-title");
    const info = root?.querySelector(".qg-info");
    assert.ok(title && info);
    assert.ok(title.getBoundingClientRect().right <= info.getBoundingClientRect().left);
  });
});

test("config.source → qg-info paths block in popover", async () => {
  await withDomWindow(async (window) => {
    const { parseKitQualityGateData } = await import("../dist/quality-gate/parse.js");
    const { buildQualityGateLayout } = await import("../dist/quality-gate/layout/index.js");
    const { paintQualityGateLayout } = await import("../dist/runtime/quality-gate-render.js");

    const data = parseKitQualityGateData(loadFixture("aqg-failed"));
    const layout = buildQualityGateLayout(data);
    const host = window.document.createElement("div");
    paintQualityGateLayout(host, layout);

    const paths = host.querySelector(".qg-info__paths");
    assert.ok(paths);
    assert.ok(host.querySelector(".qg-info__path-link[href*='allurerc.mjs']"));
    assert.ok(host.querySelector(".qg-info__path-link[href*='quality-gate.mjs']"));
  });
});

test("empty rules → hidden host", async () => {
  await withDomWindow(async (window) => {
    const { renderQualityGateHost } = await import("../dist/runtime/quality-gate-render.js");

    const host = window.document.createElement("div");
    const shown = renderQualityGateHost(host, { passed: true, rules: [] });
    assert.equal(shown, false);
    assert.equal(host.hidden, true);
    assert.equal(host.childElementCount, 0);
  });
});
