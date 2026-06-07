#!/usr/bin/env node
/**
 * Headless verification of the mini-program's core logic (can't run WeChat
 * DevTools here). Replays exactly what pages/mfd/mfd.js does — load model via the
 * generated loader map, build the grid, run the baseline sim, run a pit what-if —
 * for every race, asserting no crash and no NaN escapes. The WXML/WXSS rendering
 * still needs DevTools, but the engine+data+page-logic path is proven here.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const MP = join(dirname(fileURLToPath(import.meta.url)), '..', 'miniprogram');
const data = require(join(MP, 'data/index.js'));
const { simulate } = require(join(MP, 'lib/engine/simulate.js'));
const { buildDriversFromModel } = require(join(MP, 'lib/utils/buildDrivers.js'));
const { realRaceEvents } = require(join(MP, 'lib/utils/raceFactsEvents.js'));
const { tierBadge } = require(join(MP, 'lib/utils/qualityTier.js'));

const run = (model, events, totalLaps) =>
  simulate({ trackModel: model, initialDrivers: buildDriversFromModel(model), totalLaps, events, seed: 42, trackTempC: 32, weatherIsWet: false });
const hasNaN = (r) => r.lapHistory.flat().some((s) => !Number.isFinite(s.lapTimeSec) || !Number.isFinite(s.gapToLeaderSec));

let fail = 0;
for (const m of data.manifest) {
  try {
    const model = data.loaders[m.slug]();
    const totalLaps = model.totalLaps && model.totalLaps > 0 ? model.totalLaps : 57;
    const base = run(model, realRaceEvents(model.raceFacts), totalLaps);
    const player = base.finalOrder.filter((d) => !d.isRetired)[0].driverId;
    const events = realRaceEvents(model.raceFacts).filter((e) => !(e.type === 'pit' && e.driverId === player));
    events.push({ type: 'pit', lap: Math.round(totalLaps / 2), driverId: player, compound: 'MEDIUM' });
    const wi = run(model, events, totalLaps);
    const ok = base.finalOrder.length && wi.finalOrder.length && !hasNaN(base) && !hasNaN(wi) && tierBadge(model.dataQuality).short;
    if (!ok) { console.log('FAIL', m.slug, { nan: hasNaN(base) || hasNaN(wi) }); fail++; }
  } catch (e) {
    console.log('CRASH', m.slug, String(e).slice(0, 120)); fail++;
  }
}
console.log(fail ? `${fail} FAILED` : `✓ all ${data.manifest.length} races: load + build + simulate + pit what-if, no NaN`);
process.exit(fail ? 1 : 0);
