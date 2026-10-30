# Performance comparison report

Measured: 2026-10-23T15:37:53.959Z (UTC). Runtime: v22.23.3; win32 x64. CPU: AMD Ryzen 5 6600H with Radeon Graphics.

## Method
Compare Array.includes with Set.has across four simulated populations. Each uses 4000 fixed queries: half present, half absent. After warmup, 5 trials alternate lookup order. Values are medians in milliseconds; set construction is timed separately. Both methods must find 2000 matches.

| Population | List lookup ms | Set lookup ms | Set build ms | Build + lookup ms | Lookup speedup | Correct |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 100 | 0.6686 | 0.3493 | 0.0124 | 0.3617 | 1.91× | Yes |
| 1000 | 1.8879 | 0.1614 | 0.0291 | 0.1905 | 11.70× | Yes |
| 10000 | 18.9553 | 0.1230 | 0.7845 | 0.9075 | 154.11× | Yes |
| 50000 | 93.1170 | 0.2692 | 2.9372 | 3.2064 | 345.90× | Yes |

## What the results mean
- List lookup checks values in sequence: O(n) per query.
- Hash-set lookup averages O(1), but building the set takes O(n) time and extra memory.
- Lookup speedup excludes construction. Build + lookup adds the two medians; it is not a median of paired totals.

Timings depend on the computer, runtime, and background activity. Small measurements are noisy; memory use was not measured. This compares JavaScript membership checking, not SQLite speed. Benchmark IDs are not added to the database.

Run a fresh comparison on Performance or regenerate with npm.cmd run reports. Raw trials: performance-results.json; spreadsheet results: performance-results.csv.
  