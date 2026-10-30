# Test cases and execution report

Run: 2026-10-23T15:37:54.923Z (UTC), v22.23.3.

| Total | Passed | Failed | Cancelled | Skipped | Todo |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 38 | 38 | 0 | 0 | 0 | 0 |

## Coverage
| Area | Checks |
| --- | --- |
| Sets | Containment, complement, empty/equal sets, unique power subsets |
| Memberships | Duplicate pairs rejected; multiple clubs allowed; setup failures roll back |
| Analytics | Counts, Jaccard, rankings, recommendations, and empty cases |
| Committees | Exclusions, exact counts, k = 0 and k > n |
| Verification | Actual-ID comparisons and 512 De Morgan sample checks |
| App and reports | Request validation, button actions, error recovery, exports, worker failures |

Tests use fixtures or temporary databases; live student data is unchanged. Full case names and output: test-results.tap.

## Check manually on Windows
- Visit all pages; check narrow layouts, keyboard focus, and reduced motion.
- Join/remove a membership, repeat the action, and restart to check persistence.
- Check power-set limits, duplicate cleanup, and committee exclusions.
- Run a benchmark while changing pages; inspect De Morgan IDs.
- Export JSON, cancel another export, and open every report.

Automated results do not confirm native-window appearance, Save dialog behavior, or installer readiness.
  