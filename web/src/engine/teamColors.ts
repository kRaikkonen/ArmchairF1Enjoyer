/**
 * F1 2025 constructor colours — UI constant, not a physics parameter.
 *
 * These are the official team livery hex codes for the 2025 season.
 * They are UI-only and intentionally hard-coded here (not fitted from data).
 */
export const TEAM_COLORS: Record<string, string> = {
  'McLaren':       '#FF8000',
  'Ferrari':       '#E8002D',
  'Red Bull':      '#3671C6',
  'Mercedes':      '#27F4D2',
  'Aston Martin':  '#229971',
  'Alpine':        '#FF87BC',
  'Williams':      '#64C4FF',
  'Racing Bulls':  '#6692FF',
  'Haas':          '#B6BABD',
  'Kick Sauber':   '#52E252',
};

/** Returns the team color, falling back to a neutral grey. */
export function teamColor(team: string): string {
  return TEAM_COLORS[team] ?? '#888888';
}
