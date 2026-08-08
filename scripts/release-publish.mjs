#!/usr/bin/env node
/**
 * Publish @qa-guru/allure-report-kit and soft-fork packages to npm.
 *
 * Requires npm 2FA OTP unless the token is an automation bypass.
 *
 * Usage:
 *   npm run release:publish -- --otp=123456
 *   NPM_OTP=123456 npm run release:publish
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const otpArg = process.argv.find((arg) => arg.startsWith("--otp="));
const otp = process.env.NPM_OTP ?? (otpArg ? otpArg.slice("--otp=".length) : undefined);

const kit = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function run(cwd, args) {
  const result = spawnSync("npm", args, { cwd, encoding: "utf8" });
  if (result.stdout?.trim()) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr?.trim()) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed in ${cwd} (exit ${result.status})`);
  }
}

function publishArgs() {
  const args = ["publish", "--access", "public"];
  if (otp) {
    args.push("--otp", otp);
  }
  return args;
}

console.log(`release-publish: @qa-guru/allure-report-kit@${kit.version}`);
run(ROOT, ["run", "build"]);
run(ROOT, ["test"]);
run(ROOT, ["run", "build:fork"]);
nodePackCheck();
run(ROOT, publishArgs());
console.log(`release-publish: OK @qa-guru/allure-report-kit@${kit.version}`);

const forkArgs = ["scripts/publish-forks.mjs"];
if (otp) {
  forkArgs.push(`--otp=${otp}`);
}
run(ROOT, ["node", ...forkArgs]);
console.log("release-publish: done");

function nodePackCheck() {
  const result = spawnSync("node", ["scripts/npm-pack-check.mjs"], { cwd: ROOT, encoding: "utf8" });
  if (result.stdout?.trim()) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr?.trim()) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`npm-pack-check failed (exit ${result.status})`);
  }
}
