import { highlightJson } from "./code-highlight.js";

const INFO_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v3.5"/><circle cx="8" cy="5.15" r="0.65" fill="currentColor" stroke="none"/></svg>`;

const VIEWPORT_MARGIN = 32;
const POPOVER_GAP = 6;
const POPOVER_MAX_WIDTH = 448;
const POPOVER_MIN_HEIGHT = 80;

export interface QgInfoFileSource {
  configFile?: string;
  rulesFile?: string;
  knownIssuesFile?: string;
  profile?: string;
  projectKey?: string;
  hrefBase?: string;
  profileHref?: string;
  projectHref?: string;
}

export function resolveQgInfoPathHref(value: string, hrefBase?: string): string | null {
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (!hrefBase) {
    return null;
  }
  const base = hrefBase.endsWith("/") ? hrefBase : `${hrefBase}/`;
  return base + value.replace(/^\.\//, "");
}

function createQgInfoPathValue(
  value: string,
  hrefBase?: string,
  options: { linkable?: boolean; href?: string } = {},
): HTMLAnchorElement | HTMLSpanElement {
  const linkable = options.linkable !== false;
  const href =
    options.href ?? (linkable ? resolveQgInfoPathHref(value, hrefBase) : resolveQgInfoPathHref(value, undefined));

  if (href) {
    const link = document.createElement("a");
    link.className = "link qg-info__path-link";
    link.href = href;
    link.title = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = value;
    return link;
  }

  const span = document.createElement("span");
  span.className = "qg-info__path-value";
  span.textContent = value;
  return span;
}

function createQgInfoPaths(fileSource?: QgInfoFileSource): HTMLUListElement | null {
  if (!fileSource) {
    return null;
  }

  const rows: Array<{ label: string; value: string; linkable?: boolean; href?: string }> = [];
  if (fileSource.configFile) {
    rows.push({ label: "config", value: fileSource.configFile });
  }
  if (fileSource.rulesFile) {
    rows.push({ label: "rules", value: fileSource.rulesFile });
  }
  if (fileSource.knownIssuesFile) {
    rows.push({ label: "known", value: fileSource.knownIssuesFile });
  }
  if (fileSource.profile) {
    rows.push({
      label: "profile",
      value: fileSource.profile,
      href: fileSource.profileHref,
      linkable: !fileSource.profileHref,
    });
  }
  if (fileSource.projectKey) {
    rows.push({
      label: "project",
      value: fileSource.projectKey,
      href: fileSource.projectHref,
      linkable: !fileSource.projectHref,
    });
  }
  if (!rows.length) {
    return null;
  }

  const list = document.createElement("ul");
  list.className = "qg-info__paths";
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "qg-info__path";
    const label = document.createElement("span");
    label.className = "qg-info__path-label";
    label.textContent = row.label;
    const value = createQgInfoPathValue(row.value, fileSource.hrefBase, {
      linkable: row.linkable,
      href: row.href,
    });
    item.append(label, value);
    list.append(item);
  }
  return list;
}

function placeQgInfoPopover(trigger: HTMLElement, popover: HTMLElement): void {
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const width = Math.min(POPOVER_MAX_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const triggerRect = trigger.getBoundingClientRect();

  const spaceBelow = viewportHeight - VIEWPORT_MARGIN - triggerRect.bottom - POPOVER_GAP;
  const spaceAbove = triggerRect.top - VIEWPORT_MARGIN - POPOVER_GAP;
  const placeBelow = spaceBelow >= spaceAbove;
  const maxHeight = Math.max(POPOVER_MIN_HEIGHT, placeBelow ? spaceBelow : spaceAbove);

  popover.style.width = `${width}px`;
  popover.style.maxHeight = `${Math.round(maxHeight)}px`;
  popover.style.left = "0px";
  popover.style.top = "0px";

  const popoverHeight = popover.getBoundingClientRect().height;

  let left = triggerRect.right - width;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - width - VIEWPORT_MARGIN));

  let top: number;
  if (placeBelow) {
    top = triggerRect.bottom + POPOVER_GAP;
  } else {
    top = triggerRect.top - POPOVER_GAP - popoverHeight;
    top = Math.max(VIEWPORT_MARGIN, top);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function wireQgInfoPopover(root: HTMLElement): void {
  const trigger = root.querySelector(".qg-info__trigger");
  const popover = root.querySelector(".qg-info__popover");
  if (!(trigger instanceof HTMLElement) || !(popover instanceof HTMLElement)) {
    return;
  }

  let pinned = false;
  let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;

  const show = () => {
    popover.style.visibility = "hidden";
    popover.style.opacity = "0";
    popover.style.pointerEvents = "none";
    popover.style.display = "block";
    placeQgInfoPopover(trigger, popover);
    popover.style.removeProperty("visibility");
    popover.style.removeProperty("opacity");
    popover.style.removeProperty("pointer-events");
    root.classList.add("qg-info--open");
  };

  const hide = () => {
    root.classList.remove("qg-info--open");
  };

  const cancelHoverClose = () => {
    if (hoverCloseTimer !== undefined) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = undefined;
    }
  };

  const scheduleHoverClose = () => {
    if (pinned) {
      return;
    }
    cancelHoverClose();
    hoverCloseTimer = setTimeout(() => {
      hoverCloseTimer = undefined;
      hide();
    }, 60);
  };

  const setPinned = (next: boolean) => {
    pinned = next;
    root.classList.toggle("qg-info--pinned", pinned);
    trigger.setAttribute("aria-expanded", pinned ? "true" : "false");
    if (pinned) {
      cancelHoverClose();
      show();
      return;
    }
    hide();
    trigger.blur();
  };

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    setPinned(!pinned);
  });

  root.addEventListener("mouseenter", () => {
    cancelHoverClose();
    if (!pinned) {
      show();
    }
  });
  root.addEventListener("mouseleave", scheduleHoverClose);
  popover.addEventListener("mouseenter", cancelHoverClose);
  popover.addEventListener("mouseleave", scheduleHoverClose);

  root.addEventListener("focusin", () => {
    if (!pinned) {
      show();
    }
  });
  root.addEventListener("focusout", (event) => {
    if (pinned) {
      return;
    }
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) {
      return;
    }
    hide();
  });

  const reposition = () => {
    if (root.classList.contains("qg-info--open") || pinned) {
      placeQgInfoPopover(trigger, popover);
    }
  };

  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
}

function formatQgInfoDeviationLiteral(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return String(value);
}

export function collectQgInfoDeviationLiterals(payload: unknown): Set<string> {
  const literals = new Set<string>();
  if (!payload || typeof payload !== "object") {
    return literals;
  }

  const result = (payload as Record<string, unknown>).result;
  if (!result || typeof result !== "object") {
    return literals;
  }

  const res = result as Record<string, unknown>;

  if (Array.isArray(res.rules)) {
    for (const rule of res.rules) {
      if (!rule || typeof rule !== "object") {
        continue;
      }
      const entry = rule as Record<string, unknown>;
      if (entry.passed === false && entry.actual !== undefined && entry.actual !== null) {
        literals.add(formatQgInfoDeviationLiteral(entry.actual));
      }
    }
  }

  if (Array.isArray(res.conditions)) {
    for (const condition of res.conditions) {
      if (!condition || typeof condition !== "object") {
        continue;
      }
      const entry = condition as Record<string, unknown>;
      const status = String(entry.status ?? "").toUpperCase();
      if (status && status !== "OK" && status !== "PASSED") {
        if (entry.actualValue !== undefined && entry.actualValue !== null) {
          literals.add(formatQgInfoDeviationLiteral(entry.actualValue));
        }
      }
    }
  }

  return literals;
}

export function createQgInfo(
  content: string | Record<string, unknown>,
  fileSource?: QgInfoFileSource,
): HTMLDivElement {
  const payload = typeof content === "string" ? null : content;
  const code = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const dangerLiterals = payload ? collectQgInfoDeviationLiterals(payload) : undefined;
  const popoverId = `qg-info-${Math.random().toString(36).slice(2, 9)}`;

  const root = document.createElement("div");
  root.className = "qg-info";
  root.dataset.testid = "qg-info";
  root.innerHTML = `
    <button type="button" class="icon-btn qg-info__trigger" aria-label="Quality gate config" aria-haspopup="dialog" aria-expanded="false" aria-controls="${popoverId}">
      <span class="icon">${INFO_ICON}</span>
    </button>
    <div class="qg-info__popover" id="${popoverId}" role="dialog" aria-label="Quality gate config"></div>
  `;

  const popover = root.querySelector(".qg-info__popover");
  const paths = createQgInfoPaths(fileSource);
  if (popover instanceof HTMLElement) {
    if (paths) {
      popover.append(paths);
    }
    popover.classList.add("ch-theme--vscode");
    const pre = document.createElement("pre");
    pre.className = "qg-info__code ch-code";
    pre.setAttribute("aria-label", "Quality gate JSON");
    pre.innerHTML = highlightJson(code, { dangerLiterals });
    popover.append(pre);
  }

  wireQgInfoPopover(root);
  return root;
}
