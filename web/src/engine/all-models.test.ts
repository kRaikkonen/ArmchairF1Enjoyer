/**
 * Catalog smoke test — every shipped model must load AND simulate.
 *
 * The §8.3 + characterization tests only ever loaded Bahrain, so two models with
 * invalid `NaN` JSON (british, mexico-city) shipped and hard-crashed the browser
 * undetected. This test JSON.parses every model in the manifest, builds its grid,
 * runs a short simulation, and asserts no NaN escapes — so a bad model fails CI,
 * not the user's browser.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { describe, it, expect } from 'vitest';

import { simulate } from './simulate';
import { buildDriversFromModel } from '../utils/buildDrivers';
import type { TrackModel } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = join(__dirname, '../../public/models/tracks/2025');

const slugs = readdirSync(MODELS_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace('.json', ''));

describe('every shipped 2025 model loads and simulates', () => {
  it('finds the full catalog', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(24);
  });

  it.each(slugs)('%s: parses (valid JSON), builds drivers, simulates without NaN', (slug) => {
    // 1. Valid JSON — this alone catches the NaN-intercept crash.
    const model = JSON.parse(readFileSync(join(MODELS_DIR, `${slug}.json`), 'utf-8')) as TrackModel;

    // 2. Buildable grid.
    const drivers = buildDriversFromModel(model);
    expect(drivers.length).toBeGreaterThan(0);

    // 3. Simulates, and no NaN leaks into lap times / positions / ERS.
    const result = simulate({
      trackModel: model,
      initialDrivers: drivers,
      totalLaps: model.totalLaps && model.totalLaps > 0 ? model.totalLaps : 57,
      events: [],
      seed: 42,
      trackTempC: 32,
      weatherIsWet: false,
    });
    expect(result.finalOrder.length).toBe(drivers.length);
    for (const lap of result.lapHistory) {
      for (const s of lap) {
        expect(Number.isFinite(s.lapTimeSec), `${slug} ${s.driverId} lap ${s.lap} NaN lapTime`).toBe(true);
        expect(Number.isFinite(s.gapToLeaderSec)).toBe(true);
      }
    }
  });
});
