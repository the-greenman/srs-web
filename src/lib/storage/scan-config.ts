/**
 * Discovery-scan budgets (ADR-018) — every bound lives here, per provider and
 * mode. These are tuning knobs: adjust here, never at call sites.
 */

/**
 * Maximum folder depth below the scan root that results are reported from.
 * For the generic BFS this is a *network-cost* bound — folders deeper than
 * this are never listed. For GitHub's native scan the whole tree arrives in
 * one request, so there it is only a result-reporting bound: tuning it does
 * not change GitHub's API cost.
 */
export const SCAN_MAX_DEPTH = 3;

/** Auto mode: skip entirely when the scan root's listing is larger than this. */
export const AUTO_MAX_ROOT_ENTRIES = 50;

/** Auto mode: total listing budget, in budget units (see SCAN_ENTRIES_PER_BUDGET_UNIT). */
export const AUTO_MAX_LIST_REQUESTS = 20;

/** Explicit ("Scan for SRS") mode: total listing budget, in budget units. */
export const EXPLICIT_MAX_LIST_REQUESTS = 60;

/**
 * A folder listing of N entries costs `1 + floor(N / SCAN_ENTRIES_PER_BUDGET_UNIT)`
 * budget units. Providers paginate internally (Dropbox fully drains
 * list_folder/continue), so one logical list() call over a huge folder must
 * drain the budget instead of hiding its true request cost. Residual risk: a
 * listing's cost is only known after it returns, so one pathological folder
 * can overshoot the budget by its own size, once.
 */
export const SCAN_ENTRIES_PER_BUDGET_UNIT = 200;

/**
 * GitHub account-level fan-out: auto mode only scans accounts with at most
 * this many repositories (one tree request per repo).
 */
export const GITHUB_AUTO_MAX_REPOS = 25;

/** GitHub account-level fan-out: explicit mode scans at most this many repos, most recently pushed first. */
export const GITHUB_EXPLICIT_REPO_BUDGET = 40;

/** Cap on reported scan results; hitting it marks the scan partial. */
export const SCAN_MAX_RESULTS = 100;
