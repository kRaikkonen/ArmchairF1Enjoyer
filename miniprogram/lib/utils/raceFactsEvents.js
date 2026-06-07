"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realPitEvents = realPitEvents;
exports.realScEvents = realScEvents;
exports.realRaceEvents = realRaceEvents;
/** Real pit stops for every driver (optionally excluding the controlled one). */
function realPitEvents(facts, excludeDriverId) {
    if (!facts)
        return [];
    const ev = [];
    for (const [driverId, pits] of Object.entries(facts.strategies)) {
        if (driverId === excludeDriverId)
            continue;
        for (const p of pits) {
            // Carry the real stationary time so the baseline reproduces real slow stops
            // (e.g. a 14.7s botched stop), not a flat default.
            const e = { type: 'pit', lap: p.lap, driverId, compound: p.compound };
            if (typeof p.stationarySec === 'number')
                e.pitStationarySec = p.stationarySec;
            ev.push(e);
        }
    }
    return ev;
}
/** Real safety-car periods (full SC + virtual SC). */
function realScEvents(facts) {
    var _a;
    if (!facts)
        return [];
    const sc = facts.safetyCars.map((s) => ({ type: 'safety_car', lap: s.lap, duration: s.duration }));
    const vsc = ((_a = facts.virtualSafetyCars) !== null && _a !== void 0 ? _a : []).map((s) => ({ type: 'vsc', lap: s.lap, duration: s.duration }));
    return [...sc, ...vsc];
}
/** The full real race: every driver's real strategy + the real safety cars (incl. VSC). */
function realRaceEvents(facts) {
    return [...realPitEvents(facts), ...realScEvents(facts)];
}
