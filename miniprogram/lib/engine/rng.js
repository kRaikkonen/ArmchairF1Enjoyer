"use strict";
/**
 * Seeded PRNG wrapper around seedrandom.
 *
 * Rules:
 *  - Math.random() is FORBIDDEN in the engine layer.
 *  - All randomness must go through createRng().
 *  - Seed is derived from (globalSeed, driverId, lap) so URLs reproduce results.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRng = createRng;
exports.deriveSeed = deriveSeed;
const seedrandom_1 = __importDefault(require("./seedrandom.js"));
/**
 * Create a PRNG seeded with a numeric seed.
 * Returns a function that produces a uniform float in [0, 1).
 */
function createRng(seed) {
    const prng = (0, seedrandom_1.default)(String(seed));
    return () => prng();
}
/**
 * Derive a deterministic child seed for a specific (driver, lap) pair.
 * Uses a simple hash so that each driver/lap combination has its own
 * independent noise stream without consuming the parent RNG.
 *
 * The formula is purely arithmetic — not a physics parameter.
 */
function deriveSeed(globalSeed, driverId, lap) {
    // djb2-style hash: combine globalSeed, each char of driverId, and lap
    let h = globalSeed ^ 0x9e3779b9;
    for (let i = 0; i < driverId.length; i++) {
        h = Math.imul(h ^ driverId.charCodeAt(i), 0x9e3779b9);
    }
    h = Math.imul(h ^ lap, 0x6b3a8c5f);
    return h >>> 0; // unsigned 32-bit integer
}
