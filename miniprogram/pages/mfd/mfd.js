// MFD — replay the real race, take over a driver, change one pit, see the result.
// Runs the SAME compiled engine as the web app on the real model data.
const { simulate } = require('../../lib/engine/simulate.js');
const { buildDriversFromModel } = require('../../lib/utils/buildDrivers.js');
const { realRaceEvents } = require('../../lib/utils/raceFactsEvents.js');
const { tierBadge } = require('../../lib/utils/qualityTier.js');
const data = require('../../data/index.js');

const COMPOUND = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTER: 'I', WET: 'W' };
const SEED = 42, TEMP = 32; // baseline run params (match the web app)

Page({
  data: {
    eventName: '', tierShort: '', tierLong: '', tierClass: '',
    totalLaps: 57, lap: 57,
    standings: [],
    driverOptions: [], playerIndex: 0, playerId: '',
    pitLap: 25,
    verdict: null, isWhatIf: false,
  },

  onLoad(q) {
    const loader = data.loaders[q.slug];
    if (!loader) { wx.showToast({ title: '赛事未找到', icon: 'none' }); return; }
    const model = loader();
    this.slug = q.slug;
    this.model = model;
    this.baseDrivers = buildDriversFromModel(model);
    this.baseEvents = realRaceEvents(model.raceFacts);
    this._maxGap = 30;

    const totalLaps = model.totalLaps && model.totalLaps > 0 ? model.totalLaps : 57;
    this.baseResult = simulate({
      trackModel: model, initialDrivers: this.baseDrivers, totalLaps,
      events: this.baseEvents, seed: SEED, trackTempC: TEMP, weatherIsWet: false,
    });
    this.currentResult = this.baseResult;

    this.realPos = {};
    (model.results || []).forEach((r) => { if (r.status === 'finished') this.realPos[r.driverId] = r.position; });

    const driverOptions = this.baseResult.finalOrder.filter((d) => !d.isRetired).map((d) => d.driverId);
    const b = tierBadge(model.dataQuality);
    wx.setNavigationBarTitle({ title: model.event || 'MFD' });

    this.setData({
      eventName: model.event || q.slug,
      tierShort: b.short, tierLong: b.long, tierClass: 'badge-' + (model.dataQuality || 'podium'),
      totalLaps, lap: totalLaps,
      driverOptions, playerIndex: 0, playerId: driverOptions[0] || '',
      pitLap: Math.round(totalLaps / 2),
      standings: this.standingsAt(this.baseResult, totalLaps),
    });
  },

  onReady() { this.drawGap(); },

  standingsAt(result, lap) {
    const idx = Math.max(0, Math.min(lap, result.lapHistory.length) - 1);
    const snaps = (result.lapHistory[idx] || []).slice().sort((a, b) => a.position - b.position);
    return snaps.map((s) => ({
      pos: s.position,
      driverId: s.driverId,
      compound: COMPOUND[s.compound] || s.compound,
      gap: s.position === 1 ? '—' : '+' + s.gapToLeaderSec.toFixed(1),
      barPct: Math.min(100, (s.gapToLeaderSec / (this._maxGap || 30)) * 100),
    }));
  },

  onScrub(e) {
    const lap = e.detail.value;
    this.setData({ lap, standings: this.standingsAt(this.currentResult, lap) });
  },

  onPickPlayer(e) {
    const idx = Number(e.detail.value);
    this.setData({ playerIndex: idx, playerId: this.data.driverOptions[idx] });
  },

  onPitLap(e) { this.setData({ pitLap: e.detail.value }); },

  runWhatIf() {
    const playerId = this.data.playerId;
    if (!playerId) return;
    // the real race minus the player's real pits + one injected pit at pitLap
    const events = this.baseEvents.filter((e) => !(e.type === 'pit' && e.driverId === playerId));
    events.push({ type: 'pit', lap: Number(this.data.pitLap), driverId: playerId, compound: 'MEDIUM' });
    const res = simulate({
      trackModel: this.model, initialDrivers: this.baseDrivers, totalLaps: this.data.totalLaps,
      events, seed: SEED, trackTempC: TEMP, weatherIsWet: false,
    });
    this.currentResult = res;
    const order = res.finalOrder.filter((d) => !d.isRetired);
    const simPos = order.findIndex((d) => d.driverId === playerId) + 1;
    const realPos = this.realPos[playerId];
    this.setData({
      isWhatIf: true,
      verdict: realPos ? { realPos, simPos, delta: realPos - simPos } : null,
      standings: this.standingsAt(res, this.data.lap),
    });
    this.drawGap();
  },

  reset() {
    this.currentResult = this.baseResult;
    this.setData({ isWhatIf: false, verdict: null, standings: this.standingsAt(this.baseResult, this.data.lap) });
    this.drawGap();
  },

  drawGap() {
    wx.createSelectorQuery().in(this).select('#gap').fields({ node: true, size: true }).exec((r) => {
      if (!r || !r[0] || !r[0].node) return;
      const canvas = r[0].node, ctx = canvas.getContext('2d');
      const dpr = (wx.getSystemInfoSync().pixelRatio) || 2;
      const W = r[0].width, H = r[0].height;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      const result = this.currentResult, total = this.data.totalLaps;
      const top = result.finalOrder.filter((d) => !d.isRetired).slice(0, 6).map((d) => d.driverId);
      let maxGap = 1;
      const series = top.map((id) => {
        const pts = [];
        for (let l = 0; l < result.lapHistory.length; l++) {
          const s = result.lapHistory[l].find((x) => x.driverId === id);
          if (s) { pts.push([l + 1, s.gapToLeaderSec]); if (s.gapToLeaderSec > maxGap) maxGap = s.gapToLeaderSec; }
        }
        return pts;
      });
      this._maxGap = maxGap;
      const colors = ['#e10600', '#00d2be', '#ff8700', '#0090ff', '#b91c1c', '#e8e8ec'];
      const pad = 8;
      const X = (lap) => pad + ((lap - 1) / Math.max(1, total - 1)) * (W - 2 * pad);
      const Y = (gap) => pad + (Math.min(gap, maxGap) / maxGap) * (H - 2 * pad);
      series.forEach((pts, i) => {
        ctx.beginPath(); ctx.strokeStyle = colors[i % colors.length]; ctx.lineWidth = 1.5;
        pts.forEach(([lap, gap], j) => { const px = X(lap), py = Y(gap); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
      });
    });
  },

  onShareAppMessage() {
    const v = this.data.verdict;
    const title = v
      ? `我把 ${this.data.playerId} 推演到 P${v.simPos}（真实 P${v.realPos}）— Armchair Pitwall`
      : `${this.data.eventName} 策略推演 — Armchair Pitwall`;
    return { title, path: '/pages/mfd/mfd?slug=' + this.slug };
  },
});
