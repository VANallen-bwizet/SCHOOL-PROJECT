# Project review and improvement notes

Reviewed on 23 October 2026. Scope: the active `student-org-complete` project. JavaScript was reviewed first, followed by HTML, CSS, SQL, configuration, and documentation. Installed `node_modules`, exported datasets, and generated reports were excluded from manual editing. Generated evidence was refreshed only by running the report command. No live student database was opened or changed by this review.

## How the project works

The HTML page contains controls and tables. `renderer.js` and `workspace.js` respond to clicks. They call the small named APIs exposed by `preload.js`. The main process in `main.js` checks the sender and inputs, then calls SQLite functions or mathematical modules. The response returns to the page, where values are inserted as plain text. These are local Electron messages, not Internet requests.

## Findings and fixes

| Area | Problem | Improvement |
| --- | --- | --- |
| `main.js`: request validation | The student handler could read `.url` from a vanished frame. Array `.every()` skips missing entries in sparse arrays, and some request lists had no size limit. | Reuse one sender check, reject absent frames explicitly, validate every entry after converting to a dense array, and cap ID-list lengths. Report keys must be strings from an allowlist. |
| `main.js`: benchmark lifecycle | A worker that exited normally without sending results left the request waiting for the timeout. Active work was not explicitly stopped on application quit. | A single settlement function clears timers for every outcome, detects missing/malformed results, and permits retry. Concurrent requests still share one task. Timeout and app shutdown terminate active work. |
| `database/db.js` | Reinitializing replaced the stored connection reference. Failed schema/seed initialization could leave a connection open. | Reject double initialization; close failed setup connections and publish the usable connection only after setup succeeds. |
| `modules/organization-interests.js` | Object lookups could inherit names such as `constructor`; returning configured arrays directly allowed accidental cross-request mutation. | Use own-property checks and return copies of interest arrays. |
| `workspace.js`: initial-load recovery | A failed first Overview load left committee/proof choices unprepared even after a later successful refresh. | Prepare those controls on the first successful request, including retries, without resetting later selections. |
| `workspace.js`: report selection | An older, slower report response could replace the newest selected report. | A request number lets only the latest selection update the shared report viewer. |
| `renderer.js`: membership messages | A saved membership followed by a failed member-list read could leave the result unclear. | Preserve the save result and explain that the follow-up display refresh failed; do not suggest the write was rolled back. |
| UI error handling | Null or string rejections could cause another error while formatting a message. | Safely handle Error objects, text, and absent error values. |
| HTML/CSS and navigation | Minified HTML was hard to study; pages lacked explicit heading associations and some table headers lacked column scope. Small labels were faint. | Format the source, add useful comments, associate page headings, complete table-header scopes, improve muted text colors, and move keyboard focus into the active content. Existing controls and IDs stay connected. |
| `modules/performance.js` | The exported median helper chose the upper middle value for even-length input and accepted an empty sample. | Average the two middle values for even samples; reject an empty list. The current five-trial benchmark keeps its intended behavior. |
| `modules/analytics.js` | A nested conditional made recommendation weighting hard for a beginner to follow. | Use a straightforward `if`/`else` sequence with the same scoring rules. |
| `scripts/generate-deliverables.cjs` | Importing helpers executed generation; a fixed file list omitted future tests; recorded statuses assumed all printed cases passed. | Add an explicit CLI guard, automatic test discovery, actual PASS/FAIL/SKIP/TODO summaries, zero/missing-output checks, and cleanup of the temporary SQLite connection. |
| `package.json` | Test commands named individual files, so added tests could be silently omitted; minimum Node version was unstated. | Use Node's test discovery and declare Node >=22.13 for built-in SQLite. Regenerate lock metadata using npm in offline mode. Dependency versions were not upgraded. |

Study comments explain Maps/Sets, loops, transactions, bound SQL values, input checks, exact BigInt arithmetic, worker messages, page events, async requests, and security boundaries. They are intentionally selective rather than comments on every line. The unused startup wrapper was removed after checking its only call; other feature functions were retained.

## Security review

- Node integration remains disabled, with context isolation and renderer sandboxing enabled.
- Named preload methods are retained; raw `ipcRenderer`, SQL execution, and arbitrary file paths are not exposed.
- Request senders and input IDs are checked before privileged actions.
- SQLite uses bound parameters for data values and enforces foreign keys and unique membership pairs.
- Table/report content uses plain text. The local Content Security Policy, blocked navigation/new windows, and denied unnecessary permissions remain in place.
- The export location is selected through a native Save dialog; report filenames come from a fixed allowlist.
- No credential-like secrets were found in the editable source scan. This is a local single-user app; no remote account authentication was added.

Electron's official security guidance was consulted: https://www.electronjs.org/docs/latest/tutorial/security/ . This source review is not a certification of the framework or every installed package.

## Checks actually performed

- Baseline: the original 26 tests passed before the review fixes.
- JavaScript syntax: all 22 editable `.js`/`.cjs` files passed `node --check` after fixes.
- `npm.cmd test`: 38 tests discovered; 38 passed; zero failed, skipped, cancelled, or todo.
- `npm.cmd run reports`: succeeded and reran all 38 tests. It generated the baseline exports, mathematical report, measured benchmarks, and truthful test evidence. See `TEST-CASES.md` and `test-results.tap`.
- `npm.cmd install --package-lock-only --ignore-scripts --offline --no-audit --no-fund`: succeeded, synchronizing configuration metadata without installing dependencies or running install scripts.
- Source scan checked credential-like strings, unsafe HTML insertion, executable code patterns, and Electron security settings. Reviewed SQL `.exec()` calls contain application-controlled schema/transaction instructions, not interpolated user values.
- `npm.cmd audit --json --fetch-retries=0 --fetch-timeout=8000`: attempted, but npm registry DNS resolution failed with `ENOTFOUND registry.npmjs.org`. Therefore dependency vulnerability status could not be verified. Run `npm.cmd audit` again on a working connection; do not interpret this failed request as a clean audit.

## Remaining limitations and decisions

- Native Windows appearance, the Save dialog, and a signed/packaged installer were not verified here. There is no packaging/build command configured. Automated tests cover calculations, request routing, simulated page interactions, and error recovery, not visual appearance.
- Benchmark results remain runtime/machine dependent. They do not measure SQLite query performance. No extra performance claim is inferred from test success.
- Duplicate cleanup intentionally edits pasted raw rows; saved membership pairs are already unique. Selected interests are temporary inputs. These existing project choices remain documented and were not changed into new features during review.
- The completed and starter versions use distinct data folders. This review does not migrate the older app's data or turn the project into a multi-user service.

## Beginner study order

Read `STUDY-GUIDE.md`. It follows variables/types → conditions/loops → functions → arrays/objects/Sets/Maps → modules → browser events → async/API requests, then HTML, CSS, SQL, configuration, and tests. Start with small mathematical functions; read the long `main.js` only after understanding modules and request flow.

## Follow-up cleanup review — 23 October 2026

This follow-up covers the active `student-org-complete` application after the requested interface simplifications. The earlier findings and check results above describe the earlier review, not a new test run.

- JavaScript and its page connections were inspected first. The current report reader creates headings, lists, and tables with DOM methods and inserts report values as text. The study guide now explains that flow.
- The README now points set, relation, and Cartesian-product explanations to the mathematical report. Their former card on the Verification page was intentionally removed and was not restored.
- The folder layout already separates database access, mathematical modules, scripts, tests, baseline data, and documents. Electron's entry point, preload, and page files remain in their existing locations. No file moves or file deletions were justified by the structure review.
- The original `student-org-starter` backup is retained as requested. Source, tests, documentation, configuration, the dependency lockfile, and required generated evidence are preserved. Installed dependencies and generated files were not edited manually.
- No critical mathematical, database, or request-authorization logic was changed. An actual membership add/remove now clears outdated set/analytics/overview/committee/proof displays and asks for recalculation. Each affected request remembers a small revision counter, so a delayed answer from before the edit cannot replace the newer state. Repeated joins and absent removals leave existing results intact.
- The keyboard skip link previously added #workspace to the page address. That valid in-page navigation then failed the main process's exact sender-URL check. The link now prevents fragment navigation and moves focus directly to the content; the security check itself remains unchanged.
- The duplicate-tool description now correctly says it cleans pasted rows, without suggesting an unavailable import feature. Jaccard's denominator now explicitly means every student in either organization, counted once. A misleading preload comment was corrected.
- Removed code: the single unused .hero-card p CSS rule. The hero contains no paragraph, and no page script adds one. No source files or folders were deleted or moved. Repeated row-building loops were retained to avoid an unnecessary rewrite; dynamic proof styles and all exported mathematical helpers have verified uses.
- Future organization-interest metadata and currently undisplayed response fields were retained because they are valid configuration/API data, rather than proven obsolete code.
- The dependency audit could not reach the registry: `ENOTFOUND registry.npmjs.org`. Dependency vulnerability status remains unverified.

### Follow-up verification

- Baseline npm.cmd test: 38 passed, 0 failed.
- Final syntax checks: all 22 editable JavaScript/CommonJS files passed node --check.
- npm.cmd run reports: succeeded, rerunning all 38 tests with 38 passed and 0 failed. New regressions cover stale in-flight replies, real versus no-op membership changes, preserved selections/inputs, and the skip link. Required reports were regenerated through the script, without manual edits to generated files.
- Independent mathematical checks passed for 4,096 pairs of sets, 8,192 De Morgan law checks, and 527 committee-combination cases compared with a factorial implementation.
- An in-memory database check confirmed the 100-student, six-organization, 250-membership seed, foreign keys, duplicate rejection, cascading membership links, committee exclusions, and cleanup idempotence. No live database was opened by the review.
- HTML tag nesting passed; all 24 named preload calls have registered handlers; local imports, page assets, worker/report paths, and package/lock metadata checks passed.
- Before/after SHA-256 checks found the same 62 non-dependency files across the active project and backup, with no added/deleted files. The original backup, baseline dataset, main.js, database/schema files, and mathematical modules remained byte-for-byte unchanged.
- A targeted source scan found no credential-like strings or unsafe DOM/eval operations in the application entry/page scripts. This is a limited source check, not a dependency vulnerability audit.

Native Windows appearance, keyboard behavior in the real Electron window, Save dialog behavior, and installer packaging were not manually exercised here. This project has no configured build or installer command. Dependency auditing could not run because registry DNS failed; no clean-audit claim is made.
