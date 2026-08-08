#!/usr/bin/env node
/**
 * Both headless smokes on servers this script owns.
 *
 * Locally the pages are already up on the monorepo stands, so `npm run smoke` and
 * `npm run smoke:report` take a URL and assume it. CI has no stands, so this is
 * the entry point there: serve, smoke, shut down — and fail if either smoke does.
 *
 * Usage: node scripts/smoke-ci.mjs [dogfood|report]
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startStatic } from "./static-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2];

/**
 * Spawn and await, never `spawnSync`: the server lives in this process, and a
 * synchronous child blocks the event loop, so every request would hang.
 */
function run(command, args) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit" });
    child.on("close", (code) => done(code ?? 1));
  });
}

const TARGETS = [
  {
    id: "dogfood",
    root: ROOT,
    port: 4021,
    smoke: "scripts/smoke-dogfood.mjs",
    path: "/dogfood/",
  },
  {
    id: "report",
    root: join(ROOT, "e2e/allure-report"),
    port: 4024,
    smoke: "scripts/smoke-report.mjs",
    path: "",
    requires: join(ROOT, "e2e/allure-report/awesome/index.html"),
  },
];

let failed = false;

for (const target of TARGETS) {
  if (only && only !== target.id) {
    continue;
  }
  if (target.requires && !existsSync(target.requires)) {
    console.error(`smoke-ci: ${target.id} — nothing to serve, run \`npm run report\` first`);
    failed = true;
    continue;
  }

  const server = await startStatic({ root: target.root, port: target.port });
  const status = await run("node", [target.smoke, `${server.url}${target.path}`]);
  await server.close();

  if (status !== 0) {
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
