function cleanSolar(solarKw) {
  if (!Array.isArray(solarKw) || solarKw.length === 0) {
    throw new Error('Solar forecast is empty.');
  }
  return solarKw.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
}

function validateAppliance(a, n) {
  if (!a || typeof a.name !== 'string' || a.name.trim() === '') {
    throw new Error('Every appliance needs a name.');
  }
  const label = `"${a.name}"`;
  if (!Number.isFinite(a.powerKw) || a.powerKw <= 0) {
    throw new Error(`${label}: power must be greater than 0 kW.`);
  }
  if (!Number.isInteger(a.durationH) || a.durationH < 1 || a.durationH > n) {
    throw new Error(`${label}: run time must be a whole number of hours.`);
  }
  if (
    !Number.isInteger(a.earliest) ||
    !Number.isInteger(a.latest) ||
    a.earliest < 0 ||
    a.latest > n
  ) {
    throw new Error(`${label}: the allowed window is invalid.`);
  }
  if (a.latest - a.earliest < a.durationH) {
    throw new Error(`${label}: the allowed window is shorter than the run time.`);
  }
  if (
    !Number.isInteger(a.defaultStart) ||
    a.defaultStart < a.earliest ||
    a.defaultStart + a.durationH > a.latest
  ) {
    throw new Error(`${label}: the usual start time is outside the allowed window.`);
  }
}

function buildLoad(n, appliances, starts) {
  const load = new Array(n).fill(0);
  appliances.forEach((a, i) => {
    for (let h = starts[i]; h < starts[i] + a.durationH; h++) {
      load[h] += a.powerKw;
    }
  });
  return load;
}

function summarize(solar, load) {
  let gridKwh = 0;
  let solarUsedKwh = 0;
  for (let h = 0; h < solar.length; h++) {
    gridKwh += Math.max(0, load[h] - solar[h]);
    solarUsedKwh += Math.min(load[h], solar[h]);
  }
  return { gridKwh, solarUsedKwh, totalLoadKwh: gridKwh + solarUsedKwh };
}

// Energy from grid / solar for appliances started at the given hours.
export function evaluateStarts(solarKw, appliances, starts) {
  const solar = cleanSolar(solarKw);
  return summarize(solar, buildLoad(solar.length, appliances, starts));
}

// Greedy scheduler: biggest energy consumer first, each at the start hour
// that adds the least grid energy. Ties go to the hour closest to the usual one.
export function scheduleAppliances(solarKw, appliances) {
  const solar = cleanSolar(solarKw);
  const n = solar.length;
  appliances.forEach((a) => validateAppliance(a, n));

  const baseline = summarize(
    solar,
    buildLoad(n, appliances, appliances.map((a) => a.defaultStart))
  );

  const order = appliances
    .map((_, i) => i)
    .sort(
      (i, j) =>
        appliances[j].powerKw * appliances[j].durationH -
        appliances[i].powerKw * appliances[i].durationH
    );

  const load = new Array(n).fill(0);
  const starts = new Array(appliances.length);

  for (const idx of order) {
    const a = appliances[idx];
    let best = null;
    for (let s = a.earliest; s + a.durationH <= a.latest; s++) {
      let delta = 0;
      for (let h = s; h < s + a.durationH; h++) {
        delta +=
          Math.max(0, load[h] + a.powerKw - solar[h]) -
          Math.max(0, load[h] - solar[h]);
      }
      const dist = Math.abs(s - a.defaultStart);
      if (
        best === null ||
        delta < best.delta - 1e-9 ||
        (Math.abs(delta - best.delta) <= 1e-9 && dist < best.dist)
      ) {
        best = { s, delta, dist };
      }
    }
    starts[idx] = best.s;
    for (let h = best.s; h < best.s + a.durationH; h++) {
      load[h] += a.powerKw;
    }
  }

  const optimized = summarize(solar, load);
  return {
    placements: appliances.map((a, i) => ({
      name: a.name,
      powerKw: a.powerKw,
      durationH: a.durationH,
      defaultStart: a.defaultStart,
      start: starts[i],
      end: starts[i] + a.durationH,
    })),
    baseline,
    optimized,
    savedGridKwh: baseline.gridKwh - optimized.gridKwh,
  };
}