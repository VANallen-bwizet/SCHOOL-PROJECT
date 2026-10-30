# Advanced Student Organization and Set Analytics System

This is the completed version of the school project, with a redesigned desktop interface and all requested mathematical modules. The original `student-org-starter` folder has not been edited.

## Open and run

1. In VS Code, choose **File → Open Folder** and select this `student-org-complete` folder.
2. Open **Terminal → New Terminal**.
3. Run:

```powershell
npm.cmd start
```

The local copy includes installed dependencies. If you transfer the project without `node_modules`, run `npm.cmd install` first. Use Node.js 22.13 or newer for the terminal commands because the code uses built-in SQLite. This is a runnable Electron application; it is not a signed Windows installer.

The completed version uses its own Electron user data folder because it has a different package name. On first start it creates a separate simulated database. It will not overwrite the original app's database or carry over membership edits from that database. Both versions can be studied independently.

## What is included

| Requirement | Where to use it |
| --- | --- |
| 100 simulated students, six organizations, multiple memberships | Overview and Members |
| Dynamic add/remove; unique membership pairs | Members |
| Union, intersection, difference, symmetric difference | Set laboratory |
| Subset/superset, equality, complement | Set laboratory |
| Configurable bounded power set; cardinality | Set laboratory |
| Duplicate detection and removal | Members: raw-data cleanup and saved-table audit |
| Students in all selected organizations | Set laboratory: intersection |
| Exactly one / at least three memberships | Analytics: participation |
| Jaccard comparisons and organization overlap rankings | Analytics |
| Recommendations from memberships and selected interests | Analytics |
| Committee combinations with exclusion restrictions | Committees |
| Both De Morgan laws; direct/equivalent expressions | Verification |
| Sets, relations, Cartesian products | Mathematical report: Sets and relations |
| Increasing population sizes; list vs hash-set lookup | Performance |
| Dataset exports, documentation, mathematical report, tests | Reports & data, `dataset/`, `docs/`, `tests/` |

Duplicate cleanup operates on pasted raw rows; the saved table already prevents duplicate pairs. It does not delete legitimate multi-organization memberships. Selected recommendation interests are temporary inputs with simulated organization tags, not a stored personal profile.

## Files to study

Begin with [STUDY-GUIDE.md](docs/STUDY-GUIDE.md), written for someone who knows basic Python. It introduces JavaScript in learning order, then explains HTML, CSS, SQL, configuration, and tests. The [review notes](docs/PROJECT-REVIEW.md) describe the fixes made during the full project review and the checks that could not be completed.

| File | Responsibility |
| --- | --- |
| `main.js` | Creates the secure window; validates requests; calls database/math modules. |
| `preload.js` | Exposes only named actions to the page. |
| `index.html` | Eight workspace pages and labeled controls. |
| `styles.css` | Layout, color palette, responsive tables, subtle transitions, reduced-motion support. |
| `renderer.js` | Original membership/set/analytics tools, retained in this separate copy. |
| `workspace.js` | Navigation, overview, committee controls, verification, benchmark and reports. |
| `database/schema.sql` | Tables, foreign keys and unique membership-pair rule. |
| `database/db.js` | SQLite reads and membership writes; never imported by page scripts. |
| `database/seed.js` | Reproducible simulated starting records. |
| `modules/set-operations.js` | Demonstrated set algorithms and cardinality. |
| `modules/analytics.js` | Counts, Jaccard similarity, rankings, recommendation scoring. |
| `modules/organization-interests.js` | Editable simulated interest metadata. |
| `modules/membership-cleanup.js` | Detects repeated raw pairs and retains one copy. |
| `modules/combinatorics.js` | Eligible pools, exclusions, exact BigInt combinations. |
| `modules/verification.js` | De Morgan expressions, direct checks, exhaustive four-element sample. |
| `modules/performance.js` | Repeatable timing methodology and correctness checks. |
| `modules/benchmark-worker.js` | Runs timings off the desktop's main thread. |
| `scripts/generate-deliverables.cjs` | Regenerates baseline exports, measured reports and test evidence. |
| `tests/` | Meaningful known-answer, edge-case, security and simulated interface checks. |

## Tests and evidence

```powershell
npm.cmd test
npm.cmd run reports
```

The report command creates an in-memory baseline database and never opens the live student database. It writes CSV/JSON exports under `dataset/`, and mathematical, performance, user, and test documents under `docs/`. Current automated results are recorded in `docs/TEST-CASES.md` and `docs/test-results.tap`.

Start reading [USER-GUIDE.md](docs/USER-GUIDE.md), then [MATHEMATICAL-VERIFICATION.md](docs/MATHEMATICAL-VERIFICATION.md), [PERFORMANCE.md](docs/PERFORMANCE.md), and [TEST-CASES.md](docs/TEST-CASES.md). Source baseline data is in `dataset/baseline.json`. Use the in-app Export button for the current live data instead.

## Security and practical limits

Node integration is disabled; context isolation and sandboxing stay enabled. Scripts/styles load locally under a restrictive Content Security Policy. Database access and exports stay in main, request senders and inputs are checked, report paths are allowlisted, and table values use plain text. External navigation, new windows and unneeded permissions are blocked. Keep Electron updated.

Power sets are limited to 10 distinct existing IDs. Committees are unordered without replacement and large counts remain exact. Performance measurements are runtime/machine-specific and include separate set-build timing; they do not measure database query speed. All records are simulated.

Automated tests verify mathematical and interaction logic. Native-window visual appearance, Save dialog behavior, and the complete presentation flow should be checked on the target Windows machine before submission.
