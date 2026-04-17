/**
 * Lightweight i18n helper — no external dependency.
 *
 * Usage:  t('hud.player')              → '操控'
 *         t('hud.lapOf', {lap:20, total:52}) → '第 20 圈 / 52'
 *
 * Swap locale by changing the import below; full i18next migration can follow
 * when multi-language support is needed.
 */
import { zh } from './zh';

// Default locale for Phase 2: Chinese
const strings: Record<string, string> = zh;

/**
 * Translate a key with optional variable interpolation.
 * Variables are written as {varName} in the string.
 * Falls back to the key itself if not found (makes missing keys visible).
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = strings[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
