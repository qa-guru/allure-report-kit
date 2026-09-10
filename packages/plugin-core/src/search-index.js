/**
 * Allure 3 awesome search-index drops custom pyramid labels.
 *
 * Upstream `SEARCHABLE_LABELS` is owner/suite/package/epic/feature/story/tag/host/thread.
 * Teaching reports label tests with `module` / `layer` / `language` / `scope`, so
 * `?query=backend-java-spring` is empty unless those values are folded in here.
 */

export const EXTRA_SEARCHABLE_LABELS = ["module", "layer", "language", "scope"];

const SEARCH_INDEX_PATH = /(^|\/)search-index\.json$/;

export function isSearchIndexPath(path) {
  return typeof path === "string" && SEARCH_INDEX_PATH.test(path);
}

function extraSearchTokens(labels) {
  return (labels ?? []).flatMap((label) => {
    const name = label?.name;
    const value = typeof label?.value === "string" ? label.value.trim() : "";
    if (!value || !EXTRA_SEARCHABLE_LABELS.includes(name)) {
      return [];
    }
    return [`${name}:${value}`, value];
  });
}

function joinSearchValues(values) {
  const unique = new Set(values.map((value) => value?.trim()).filter(Boolean));
  return unique.size > 0 ? [...unique].join(" ") : undefined;
}

function indexTestResults(testResults) {
  const byId = new Map();
  const byHistoryId = new Map();
  for (const result of testResults ?? []) {
    if (result?.id) {
      byId.set(result.id, result);
    }
    if (result?.historyId) {
      byHistoryId.set(result.historyId, result);
    }
  }
  return { byId, byHistoryId };
}

/**
 * Fold pyramid labels into awesome `search-index.json` documents.
 *
 * @param {object[]} documents
 * @param {object[]} testResults
 * @returns {object[]}
 */
export function enrichSearchDocuments(documents, testResults) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return documents;
  }
  const { byId, byHistoryId } = indexTestResults(testResults);
  return documents.map((doc) => {
    const result = byId.get(doc.id) ?? byHistoryId.get(doc.historyId);
    const extra = extraSearchTokens(result?.labels);
    if (extra.length === 0) {
      return doc;
    }
    const extraJoined = joinSearchValues(extra);
    if (!extraJoined) {
      return doc;
    }
    const labels = typeof doc.labels === "string" && doc.labels.trim()
      ? `${doc.labels} ${extraJoined}`
      : extraJoined;
    return { ...doc, labels };
  });
}

export async function enrichSearchIndexFile(data, store) {
  if (!store?.allTestResults) {
    return data;
  }
  let documents;
  try {
    documents = JSON.parse(data.toString("utf8"));
  } catch {
    return data;
  }
  if (!Array.isArray(documents)) {
    return data;
  }
  const testResults = await store.allTestResults();
  return Buffer.from(JSON.stringify(enrichSearchDocuments(documents, testResults)), "utf8");
}
