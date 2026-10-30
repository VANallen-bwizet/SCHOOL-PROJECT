const { performance } = require('node:perf_hooks');

function median(values) {
  if (values.length === 0) throw new Error('Cannot find the median of an empty list.');
  // Sort a copy, so callers keep their original trial order for the raw report.
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runBenchmark() {
  const sizes = [100, 1000, 10000, 50000];
  const queryCount = 4000;
  const trials = 5;
  const results = [];
  for (const size of sizes) {
    const list = Array.from({ length: size }, (_, index) => index + 1);
    // Repeatable query stream: even queries hit; odd queries miss.
    const queries = Array.from({ length: queryCount }, (_, index) =>
      index % 2 === 0 ? ((index * 7919) % size) + 1 : size + index + 1);
    const timing = { list: [], hash: [], build: [] };
    let listHits = 0;
    let hashHits = 0;
    // Untimed warmup exercises both lookups and set construction.
    const warmSet = new Set(list);
    for (const query of queries.slice(0, 500)) { list.includes(query); warmSet.has(query); }
    for (let trial = 0; trial < trials; trial++) {
      let start = performance.now();
      const hash = new Set(list);
      timing.build.push(performance.now() - start);
      const listRun = () => {
        start = performance.now();
        let hits = 0;
        for (const query of queries) if (list.includes(query)) hits++;
        timing.list.push(performance.now() - start);
        listHits = hits;
      };
      const hashRun = () => {
        start = performance.now();
        let hits = 0;
        for (const query of queries) if (hash.has(query)) hits++;
        timing.hash.push(performance.now() - start);
        hashHits = hits;
      };
      // Alternate order to reduce systematic ordering bias.
      if (trial % 2) { hashRun(); listRun(); } else { listRun(); hashRun(); }
      if (listHits !== hashHits || listHits !== queryCount / 2) throw new Error('Benchmark correctness check failed.');
    }
    const listMs = median(timing.list);
    const hashMs = median(timing.hash);
    const buildMs = median(timing.build);
    results.push({ size, queryCount, listMs, hashMs, buildMs,
      hashTotalMs: hashMs + buildMs, lookupSpeedup: hashMs > 0 ? listMs / hashMs : null,
      hits: listHits, correct: listHits === hashHits, rawTrials: timing });
  }
  return { measuredAt: new Date().toISOString(), runtime: process.version,
    platform: `${process.platform} ${process.arch}`, trials, queryCount, results };
}

module.exports = { median, runBenchmark };
