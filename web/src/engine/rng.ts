/**
 * Seeded PRNG wrapper around seedrandom.
 *
 * Rules:
 *  - Math.random() is FORBIDDEN in the engine layer.
 *  - All randomness must go through createRng().
 *  - Seed is derived from (globalSeed, driverId, lap) so URLs reproduce results.
 */

import seedrandom from 'seedrandom';

export type Rng = ReturnType<typeof createRng>;

/**
 * Create a PRNG seeded with a numeric seed.
 * Returns a function that produces a uniform float in [0, 1).
 */
export function createRng(seed: number): () => number {
  const prng = seedrandom(String(seed));
  return () => prng();
}

/**
 * Derive a deterministic child seed for a specific (driver, lap) pair.
 * Uses a simple hash so that each driver/lap combination has its own
 * independent noise stream without consuming the parent RNG.
 *
 * The formula is purely arithmetic — not a physics parameter.
 */
export function deriveSeed(globalSeed: number, driverId: string, lap: number): number {
  // djb2-style hash: combine globalSeed, each char of driverId, and lap
  let h = globalSeed ^ 0x9e3779b9;
  for (let i = 0; i < driverId.length; i++) {
    h = Math.imul(h ^ driverId.charCodeAt(i), 0x9e3779b9);
  }
  h = Math.imul(h ^ lap, 0x6b3a8c5f);
  return h >>> 0; // unsigned 32-bit integer
}
