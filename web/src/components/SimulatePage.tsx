/**
 * Simulate page — loading/progress screen.
 *
 * Phase 1: Since simulate() is synchronous and fast, this page is a
 * transient state that shows a spinner before the result is ready.
 * Phase 2 may introduce a Web Worker with incremental progress.
 */

import { useEffect } from 'react';
import { useRaceStore } from '../store/raceStore';

export function SimulatePage() {
  const setView = useRaceStore((s) => s.setView);
  const result = useRaceStore((s) => s.result);
  const isRunning = useRaceStore((s) => s.isRunning);

  // Auto-advance to result when simulation completes
  useEffect(() => {
    if (!isRunning && result) {
      setView('result');
    }
  }, [isRunning, result, setView]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4">
      <div className="text-f1-red text-4xl animate-spin">◐</div>
      <p className="text-f1-muted text-sm">Simulating race…</p>
    </main>
  );
}
