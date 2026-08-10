import assert from "node:assert/strict";
import { test } from "node:test";

import { declareSuite } from "./test-meta.mjs";

declareSuite({
  feature: "tests-table",
  story: "Height-sliced row count",
  layer: "unit",
  severity: "normal",
});

import { TESTS_TABLE_HEADER_H, TESTS_TABLE_ROW_H, testsTableMaxRows } from "../dist/runtime/tests-table-render.js";

test("testsTableMaxRows matches collage formula", () => {
  assert.equal(testsTableMaxRows(0), 1);
  assert.equal(testsTableMaxRows(28), 1);
  assert.equal(testsTableMaxRows(59), 1);
  assert.equal(testsTableMaxRows(60), 1);
  assert.equal(testsTableMaxRows(92), 2);
  assert.equal(testsTableMaxRows(220), Math.floor((220 - TESTS_TABLE_HEADER_H) / TESTS_TABLE_ROW_H));
  assert.equal(TESTS_TABLE_HEADER_H, 28);
  assert.equal(TESTS_TABLE_ROW_H, 32);
});
