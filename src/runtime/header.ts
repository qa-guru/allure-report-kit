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
  /**
   * Header markup, for a report that cannot fetch it.
   *
   * `singleFile: true` leaves nothing on disk to request, so the template
   * travels inside the document and is served to the DS module from memory.
   */
  templateHtml?: string;
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
  /**
   * What `import.meta.url` becomes inside the inlined header bundle.
   *
   * The bundle is imported from a `data:` URL, which cannot be the base of a
   * relative resolution, so `scripts/build-inline.mjs` redirects the reference
   * here and the document URL takes its place.
   */
  __arkHeaderBaseUrl?: string;
}

type IconSync = (button: HTMLElement) => void;

/** Path the DS header asks for; matched by suffix, not by full URL. */
const TEMPLATE_PATH = "templates/header.html";

/**
 * Answer the DS header's own template request out of memory.
 *
 * `fetchTemplateText` calls `fetch` directly and takes no override, and the
 * module is vendored, not forked — so the request is intercepted rather than
 * the source edited. Scoped as tightly as it can be: one path, and the original
 * `fetch` is restored as soon as the header is up.
 */
function serveTemplate(html: string): () => void {
  const original = globalThis.fetch;
  if (typeof original !== "function") {
    return () => {};
  }
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith(TEMPLATE_PATH)) {
      return Promise.resolve(new Response(html, { headers: { "content-type": "text/html" } }));
    }
    return original(input, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = original;
  };
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

/**
 * Publish the real occupied band as `--ark-header-height`.
 *
 * The nominal `--header-height` misses the bottom border, and the DS header
 * doubles its band when the metrics row wraps — measuring is the only value
 * that stays right.
 */
function trackHeaderHeight(mount: HTMLElement): () => void {
  const header = mount.querySelector<HTMLElement>(".header");
  if (!header) {
    return () => {};
  }
  const apply = (): void => {
    document.documentElement.style.setProperty(
      "--ark-header-height",
      `${Math.ceil(header.getBoundingClientRect().height)}px`,
    );
  };
  apply();

  if (typeof ResizeObserver === "undefined") {
    return () => {};
  }
  const observer = new ResizeObserver(apply);
  observer.observe(header);
  return () => observer.disconnect();
}

/**
 * Keep the two theme switches in step.
 *
 * The design-system header writes `html.theme-light`; Allure reads
 * `html[data-theme]` and has its own control. Mirroring one way left the other
 * switch stale — the report would flip while the header kept the old icon and
 * palette. So both directions are mirrored, with a guard against the echo of
 * our own write.
 */
function syncReportTheme(loadIconSync: () => Promise<IconSync | undefined>): () => void {
  const html = document.documentElement;
  let mirroring = false;

  /**
   * The DS header only repaints its icon inside its own click handler, so a
   * theme change coming from Allure's control would leave a stale glyph.
   */
  const refreshIcons = (): void => {
    void loadIconSync()
      .then((sync) => {
        if (!sync) {
          return;
        }
        document
          .querySelectorAll<HTMLElement>(
            '[data-testid="header-theme-toggle"], [data-testid="header-menu-theme-toggle"]',
          )
          .forEach(sync);
      })
      .catch(() => {
        /* icon stays as is — not worth failing the report over */
      });
  };

  const mirror = (write: () => void): void => {
    if (mirroring) {
      return;
    }
    mirroring = true;
    write();
    // Let the mutation record for our own write drain before listening again.
    queueMicrotask(() => {
      mirroring = false;
    });
  };

  const fromDs = (): void => {
    const next = html.classList.contains("theme-light") ? "light" : "dark";
    if (html.dataset.theme !== next) {
      mirror(() => {
        html.dataset.theme = next;
      });
    }
  };

  const fromReport = (): void => {
    const light = html.dataset.theme !== "dark";
    if (html.classList.contains("theme-light") !== light) {
      mirror(() => html.classList.toggle("theme-light", light));
      refreshIcons();
    }
  };

  fromDs();

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.attributeName === "class") {
        fromDs();
      } else if (record.attributeName === "data-theme") {
        fromReport();
      }
    }
  });
  observer.observe(html, { attributes: true, attributeFilter: ["class", "data-theme"] });
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
    // Seed from the host: the DS header applies its own default on mount, which
    // would otherwise flip a dark report to light the moment it appears.
    theme: { default: document.documentElement.dataset.theme === "dark" ? "dark" : "light" },
  };

  // Compiled to dist/runtime/, while the vendored primitives ship under
  // src/theme/ in both the repo and the published tarball (see package files).
  const moduleUrl =
    options.moduleUrl ??
    new URL("../../src/theme/vendor/design-system/js/header.js", import.meta.url);

  // Read by the inlined bundle in place of `import.meta.url`; the module copied
  // as a tree has a real one and ignores this.
  scope.__arkHeaderBaseUrl = document.baseURI;

  const restoreFetch = options.templateHtml ? serveTemplate(options.templateHtml) : () => {};
  let module: Record<string, unknown> = {};
  let slot: HTMLElement | undefined;
  try {
    // The URL is resolved at runtime against the report; bundlers must not try
    // to follow it, or the import turns into a missing chunk.
    module = (await import(/* webpackIgnore: true */ /* @vite-ignore */ String(moduleUrl))) as Record<
      string,
      unknown
    >;

    // The module mounts itself without awaiting, so the template request lands
    // after `import()` settles — the shim has to outlive it, and can only go
    // once the markup is in the DOM.
    slot = await waitForSlot(mount);
  } finally {
    restoreFetch();
  }
  if (slot && options.productName) {
    applyProductName(slot, options.productName);
  }

  if (options.contentRoot) {
    options.contentRoot.classList.add("ark-report--with-header");
  }

  // The inlined bundle re-exports the icon sync; the tree-copied module keeps it
  // in a sibling file, and only then is there a URL to resolve against.
  const loadIconSync = async (): Promise<IconSync | undefined> => {
    if (typeof module.syncThemeToggleIcon === "function") {
      return module.syncThemeToggleIcon as IconSync;
    }
    const sibling = (await import(
      /* webpackIgnore: true */ /* @vite-ignore */ new URL("theme-icons.js", moduleUrl).href
    )) as { syncThemeToggleIcon?: IconSync };
    return sibling.syncThemeToggleIcon;
  };

  const stopTracking = trackHeaderHeight(mount);
  const stopThemeSync =
    options.syncReportTheme === false ? () => {} : syncReportTheme(loadIconSync);

  return {
    mount,
    dispose: () => {
      stopTracking();
      stopThemeSync();
    },
  };
}
