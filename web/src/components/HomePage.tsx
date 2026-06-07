/**
 * Home page — race selector, driven by the generated manifest
 * (/models/tracks/<year>/index.json) so every onboarded race shows up
 * automatically. Picking a race goes straight into the MFD.
 */

import { useEffect, useState } from 'react';
import { useRaceStore } from '../store/raceStore';
import type { TrackModel } from '../engine/types';
import { buildDriversFromModel } from '../utils/buildDrivers';

interface RaceEntry {
  slug: string;
  name: string;
  round: number;
  season: number;
  totalLaps?: number;
  circuitLengthKm?: number | null;
  dataQuality?: 'ok' | 'limited';
}

const SEASON = 2025;

export function HomePage() {
  const setView = useRaceStore((s) => s.setView);
  const setTrackModel = useRaceStore((s) => s.setTrackModel);
  const setDrivers = useRaceStore((s) => s.setDrivers);
  const [races, setRaces] = useState<RaceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/models/tracks/${SEASON}/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: RaceEntry[]) => setRaces(d))
      .catch((e) => setError(String(e)));
  }, []);

  async function selectTrack(race: RaceEntry) {
    try {
      const res = await fetch(`/models/tracks/${race.season}/${race.slug}.json`);
      if (!res.ok) throw new Error(`Failed to load ${race.slug}`);
      const model = (await res.json()) as TrackModel;
      setTrackModel(model);
      setDrivers(buildDriversFromModel(model));
      setView('mfd');
    } catch (err) {
      console.error('Failed to load track model:', err);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-f1-red tracking-wide uppercase">Armchair Pitwall</h1>
        <p className="text-f1-muted text-sm mt-1">复现真实那场比赛，然后接管车手改写结局</p>
      </header>

      <section aria-label="Select a race">
        <h2 className="text-xs uppercase tracking-widest text-f1-muted mb-3">
          {SEASON} 赛季 · 选一场比赛（{races.length} 场）
        </h2>
        {error && <div className="text-f1-muted text-sm">赛事清单加载失败：{error}</div>}
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {races.map((race) => (
            <li key={race.slug}>
              <button
                onClick={() => void selectTrack(race)}
                className="w-full text-left bg-f1-mid border border-f1-border rounded-lg px-4 py-3 hover:border-f1-red transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-f1-muted font-mono">R{race.round}</span>
                  {race.dataQuality === 'limited' && (
                    <span className="text-[9px] text-yellow-500/90 border border-yellow-500/40 rounded px-1">数据不足·仅供参考</span>
                  )}
                </div>
                <div className="font-semibold text-f1-text mt-0.5">{race.name}</div>
                <div className="text-f1-muted text-xs mt-0.5">
                  {race.circuitLengthKm ? `${race.circuitLengthKm.toFixed(3)} km · ` : ''}{race.totalLaps ?? '?'} 圈
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 text-center text-xs text-f1-muted">
        <p>Model v1 · 数据来自 FastF1 · 与 F1/FIA/车队无关</p>
      </footer>
    </main>
  );
}
