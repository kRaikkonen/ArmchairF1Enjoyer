// Home — race list from the generated manifest (same data the web app uses).
const data = require('../../data/index.js');
const { tierBadge } = require('../../lib/utils/qualityTier.js');

Page({
  data: { races: [] },

  onLoad() {
    const races = data.manifest.map((r) => {
      const b = tierBadge(r.dataQuality);
      return {
        slug: r.slug,
        name: r.name,
        round: r.round,
        totalLaps: r.totalLaps,
        km: r.circuitLengthKm ? r.circuitLengthKm.toFixed(3) : '',
        badgeShort: b.short,
        badgeClass: 'badge-' + (r.dataQuality || 'podium'),
      };
    });
    this.setData({ races });
  },

  selectRace(e) {
    wx.navigateTo({ url: '/pages/mfd/mfd?slug=' + e.currentTarget.dataset.slug });
  },
});
