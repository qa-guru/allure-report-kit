/**
 * `theme.header` — the design-system header primitive on top of the report.
 *
 * This is the report chrome, not the tile bar: the panel bar lives inside a
 * card and carries indicators, this one spans the whole page.
 *
 * The DS module self-mounts into `#app-header` on import and reads
 * `window.headerConfig`, so the kit prepares both before importing it. The
 * vendored copy under `src/theme/vendor/design-system/` keeps the `js/` +
 * `templates/` layout the module expects.
 */
import type { KitThemeHeaderConfig } from "../types.js";

export interface MountHeaderOptions extends KitThemeHeaderConfig {
  /** Where to place the header mount; defaults to the start of `<body>`. */
  container?: HTMLElement;
  /** URL of the vendored DS `header.js`. */
  moduleUrl?: string | URL;
  /** Element that must be pushed below the fixed header. */
  contentRoot?: HTMLElement;
}

export interface HeaderHandle {
  mount: HTMLElement;
  /** Stop mirroring the DS theme class onto the Allure theme attribute. */
  dispose: () => void;
}

interface HeaderWindow {
  headerConfig?: Record<string, unknown>;
}

function ensureMount(container: HTMLElement): HTMLElement {
  const existing = document.getElementById("app-header");
  if (existing) {
    return existing;
  }
  const mount = document.createElement("div");
  mount.id = "app-header";
  container.prepend(mount);
  return mount;
}

/** DS writes `html.theme-light`; Allure reads `html[data-theme]`. */
function syncReportTheme(): () => void {
  const html = document.documentElement;
  const apply = (): void => {
    html.dataset.theme = html.classList.contains("theme-light") ? "light" : "dark";
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(html, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * The DS module mounts itself on import and fetches its template, so the slot
 * appears a tick or two after `import()` settles.
 */
function waitForSlot(mount: HTMLElement, timeoutMs = 5000): Promise<HTMLElement | undefined> {
  const selector = '[data-testid="header-slot"]';
  const found = mount.querySelector<HTMLElement>(selector);
  if (found) {
    return Promise.resolve(found);
  }
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const slot = mount.querySelector<HTMLElement>(selector);
      if (slot) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(slot);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(undefined);
    }, timeoutMs);
    observer.observe(mount, { childList: true, subtree: true });
  });
}

function applyProductName(slot: HTMLElement, productName: string): void {
  const label = document.createElement("span");
  label.className = "ark-header__product";
  label.dataset.testid = "ark-header-product";
  label.textContent = productName;
  slot.replaceChildren(label);
}

export async function mountReportHeader(
  options: MountHeaderOptions = {},
): Promise<HeaderHandle | undefined> {
  if (options.enabled === false || options.source === "none") {
    return undefined;
  }
  if (typeof document === "undefined") {
    return undefined;
  }

  const container = options.container ?? document.body;
  const mount = ensureMount(container);

  const scope = globalThis as unknown as HeaderWindow;
  scope.headerConfig = {
    ...(scope.headerConfig ?? {}),
    ...(options.brandHref ? { brand: { href: options.brandHref } } : {}),
    ...(options.nav ? { nav: options.nav } : {}),
    lang: { default: options.lang ?? "ru" },
  };

  // Compiled to dist/runtime/, while the vendored primitives ship under
  // src/theme/ in both the repo and the published tarball (see package files).
  const moduleUrl =
    options.moduleUrl ??
    new URL("../../src/theme/vendor/design-system/js/header.js", import.meta.url);
  await import(/* @vite-ignore */ String(moduleUrl));

  const slot = await waitForSlot(mount);
  if (slot && options.productName) {
    applyProductName(slot, options.productName);
  }

  if (options.contentRoot) {
    options.contentRoot.classList.add("ark-report--with-header");
  }

  const dispose = options.syncReportTheme === false ? () => {} : syncReportTheme();
  return { mount, dispose };
}
