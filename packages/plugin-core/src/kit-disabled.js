/**
 * Why the kit is off for this report, or `undefined` when it is on.
 *
 * Split out and exported so the fallback is testable without generating a
 * report: silently rendering stock Allure is the worst failure mode this plugin
 * has, and it should stay hard to reach by accident.
 */
export function kitDisabledReason(manifest, options = {}) {
  if (!manifest) {
    return "no kit manifest in plugin options — did you wrap the config with withKit()?";
  }
  return undefined;
}
