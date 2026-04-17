/**
 * Event Bar — toggleable race-event injection strip.
 * All toggles drive local state only (Phase 2 skeleton).
 * Real injection into the simulation engine happens in Phase 3.
 */
import { useState } from 'react';
import { t } from '../../i18n';

interface EventBarProps {
  playerId: string;
  drivers: string[];
}

export function EventBar({ playerId, drivers }: EventBarProps) {
  const [scActive, setScActive]   = useState(false);
  const [vscActive, setVscActive] = useState(false);
  const [rainActive, setRainActive] = useState(false);
  const [pitError, setPitError]   = useState(false);
  const [gunFail, setGunFail]     = useState(false);

  // Penalty state
  const [penaltyDriver, setPenaltyDriver] = useState(playerId);
  const [penaltySec, setPenaltySec]       = useState(5);
  const [penaltyActive, setPenaltyActive] = useState(false);

  // Pit error state
  const [pitErrorSec, setPitErrorSec] = useState(6);

  return (
    <div className="flex items-center gap-2 px-3 h-11 bg-f1-surface border-b border-f1-border shrink-0 overflow-x-auto">
      {/* Separator label */}
      <span className="text-f1-muted text-[10px] uppercase tracking-widest shrink-0 mr-1">
        {t('event.addVar')}
      </span>
      <div className="w-px h-5 bg-f1-border shrink-0" />

      {/* SC */}
      <ToggleBtn active={scActive} onClick={() => setScActive(!scActive)}>
        {t('event.sc')}
      </ToggleBtn>

      {/* VSC */}
      <ToggleBtn active={vscActive} onClick={() => setVscActive(!vscActive)}>
        {t('event.vsc')}
      </ToggleBtn>

      {/* Rain */}
      <ToggleBtn active={rainActive} onClick={() => setRainActive(!rainActive)}>
        {t('event.rain')}
      </ToggleBtn>

      <div className="w-px h-5 bg-f1-border shrink-0" />

      {/* Pit error */}
      <ToggleBtn active={pitError} onClick={() => setPitError(!pitError)}>
        {t('event.pitError')}
      </ToggleBtn>
      {pitError && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={pitErrorSec}
            min={2}
            max={30}
            onChange={(e) => setPitErrorSec(Number(e.target.value))}
            className="w-12 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text text-center"
          />
          <span className="text-f1-muted text-xs">s</span>
        </div>
      )}

      {/* Gun failure */}
      <ToggleBtn active={gunFail} onClick={() => setGunFail(!gunFail)}>
        {t('event.gunFailure')}
      </ToggleBtn>

      <div className="w-px h-5 bg-f1-border shrink-0" />

      {/* Penalty */}
      <span className="text-f1-muted text-[10px] shrink-0">{t('event.penalty')}</span>
      <select
        value={penaltyDriver}
        onChange={(e) => setPenaltyDriver(e.target.value)}
        className="bg-f1-mid border border-f1-border rounded px-1.5 py-0.5 text-xs text-f1-text"
      >
        {drivers.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <span className="text-f1-muted text-[10px]">+</span>
      <input
        type="number"
        value={penaltySec}
        min={1}
        max={60}
        onChange={(e) => setPenaltySec(Number(e.target.value))}
        className="w-12 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text text-center"
      />
      <span className="text-f1-muted text-xs">s</span>
      <ActivateBtn active={penaltyActive} onClick={() => setPenaltyActive(!penaltyActive)}>
        {t('event.activate')}
      </ActivateBtn>
    </div>
  );
}

function ToggleBtn({
  children, active, onClick,
}: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-2 py-1 rounded text-[11px] font-medium shrink-0 border transition-colors',
        active
          ? 'bg-yellow-500 text-gray-900 border-yellow-500'
          : 'bg-f1-mid border-f1-border text-f1-muted hover:text-f1-text hover:border-f1-muted',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ActivateBtn({
  children, active, onClick,
}: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-2 py-1 rounded text-[11px] font-medium shrink-0 border transition-colors',
        active
          ? 'bg-f1-orange text-white border-f1-orange'
          : 'bg-f1-mid border-f1-border text-f1-muted hover:border-f1-orange hover:text-f1-orange',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
