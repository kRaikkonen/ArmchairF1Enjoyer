/**
 * Radio Log — right column.
 * Displays team radio messages and AI strategy updates in chronological order
 * (newest at top). Text is deliberately vague / anonymized, matching the
 * armchair pitwall tone.
 */
import { t } from '../../i18n';

export interface RadioEntry {
  id: string;
  from: 'fia' | 'ai' | 'driver' | 'engineer';
  laps: string;   // e.g. "L1~3" or "L20"
  message: string;
}

interface RadioLogProps {
  entries: RadioEntry[];
}

const FROM_STYLE: Record<string, { label: string; cls: string }> = {
  fia:      { label: 'FIA 干事查',  cls: 'text-yellow-400' },
  ai:       { label: 'AI 策略',     cls: 'text-blue-400'   },
  driver:   { label: '车手',        cls: 'text-green-400'  },
  engineer: { label: '工程师',      cls: 'text-f1-orange'  },
};

export function RadioLog({ entries }: RadioLogProps) {
  return (
    <aside className="w-[224px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-hidden">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-f1-muted border-b border-f1-border shrink-0">
        {t('radio.title')}
      </div>
      <ul className="overflow-y-auto flex-1 flex flex-col gap-0">
        {entries.map((entry) => {
          const style = FROM_STYLE[entry.from] ?? FROM_STYLE.engineer;
          return (
            <li
              key={entry.id}
              className="px-2 py-2 border-b border-f1-border text-xs"
            >
              <div className="flex items-baseline justify-between mb-0.5">
                <span className={`font-semibold text-[10px] ${style.cls}`}>
                  {style.label}
                </span>
                <span className="text-f1-border text-[9px] font-mono">
                  {entry.laps}
                </span>
              </div>
              <p className="text-f1-muted leading-snug text-[11px]">
                {entry.message}
              </p>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
