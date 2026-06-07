"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEAM_COLORS = void 0;
exports.teamColor = teamColor;
/**
 * F1 2025 constructor colours — UI constant, not a physics parameter.
 *
 * These are the official team livery hex codes for the 2025 season.
 * They are UI-only and intentionally hard-coded here (not fitted from data).
 */
exports.TEAM_COLORS = {
    'McLaren': '#FF8000',
    'Ferrari': '#E8002D',
    'Red Bull': '#3671C6',
    'Mercedes': '#27F4D2',
    'Aston Martin': '#229971',
    'Alpine': '#FF87BC',
    'Williams': '#64C4FF',
    'Racing Bulls': '#6692FF',
    'Haas': '#B6BABD',
    'Kick Sauber': '#52E252',
};
/** Returns the team color, falling back to a neutral grey. */
function teamColor(team) {
    var _a;
    return (_a = exports.TEAM_COLORS[team]) !== null && _a !== void 0 ? _a : '#888888';
}
