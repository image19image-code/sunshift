import { scheduleAppliances, evaluateStarts } from './scheduler.js';

// Synthetic sunny day: bell curve peaking at 3 kW at noon (for testing only).
const solar = Array.from({ length: 24 }, (_, h) =>
  h >= 6 && h <= 18 ? 3 * Math.sin((Math.PI * (h - 6)) / 12) : 0
);

const appliances = [
  { name: 'Washing machine', powerKw: 0.5, durationH: 2, earliest: 8, latest: 22, defaultStart: 19 },
  { name: 'Dishwasher', powerKw: 1.2, durationH: 2, earliest: 8, latest: 23, defaultStart: 21 },
  { name: 'EV charger', powerKw: 3.3, durationH: 4, earliest: 8, latest: 24, defaultStart: 18 },
];

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}

const result = scheduleAppliances(solar, appliances);

// Brute force: try every combination of start hours to find the true optimum.
let bruteBest = Infinity;
function search(i, starts) {
  if (i === appliances.length) {
    bruteBest = Math.min(bruteBest, evaluateStarts(solar, appliances, starts).gridKwh);
    return;
  }
  const a = appliances[i];
  for (let s = a.earliest; s + a.durationH <= a.latest; s++) {
    search(i + 1, [...starts, s]);
  }
}
search(0, []);

const totalEnergy = appliances.reduce((sum, a) => sum + a.powerKw * a.durationH, 0);

console.log('');
console.log(`Baseline grid energy : ${result.baseline.gridKwh.toFixed(2)} kWh`);
console.log(`Optimized grid energy: ${result.optimized.gridKwh.toFixed(2)} kWh`);
console.log(`Brute-force optimum  : ${bruteBest.toFixed(2)} kWh`);
result.placements.forEach((p) =>
  console.log(`  ${p.name}: ${p.defaultStart}:00 -> ${p.start}:00`)
);
console.log('');

check('optimized uses no more grid energy than baseline',
  result.optimized.gridKwh <= result.baseline.gridKwh + 1e-9);
check('every appliance stays inside its allowed window',
  result.placements.every((p, i) => p.start >= appliances[i].earliest && p.end <= appliances[i].latest));
check('total energy is conserved (baseline)',
  Math.abs(result.baseline.totalLoadKwh - totalEnergy) < 1e-9);
check('total energy is conserved (optimized)',
  Math.abs(result.optimized.totalLoadKwh - totalEnergy) < 1e-9);
check('brute-force optimum is not worse than greedy',
  bruteBest <= result.optimized.gridKwh + 1e-9);

let threw = false;
try {
  scheduleAppliances(solar, [{ name: 'Bad', powerKw: 1, durationH: 5, earliest: 8, latest: 10, defaultStart: 8 }]);
} catch {
  threw = true;
}
check('invalid appliance is rejected with an error', threw);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;