/**
 * Honest quality-tier presentation, shared by the race list and the MFD banner.
 *
 * The midfield is event-driven (safety cars, pit luck, first-lap incidents) and
 * not predictable from pace, so we grade per race instead of a flat "数据不足".
 * A tier claiming trust must BEAT the grid-order null baseline (just copy the
 * starting grid) on the gated top-5 metric — F1 front rows are sticky, so a model
 * that loses to "read the grid" has earned nothing:
 *   ok     — front AND midfield faithful, and beats the grid (rare).
 *   podium — podium/front trustworthy AND beats the grid baseline.
 *   rough  — either the race is chaotic, OR the model doesn't beat reading
 *            qualifying; for fun only.
 */
export type QualityTier = 'ok' | 'podium' | 'rough';

export interface TierBadge {
  short: string; // chip on the race card
  long: string;  // sentence for the MFD trust banner
  cls: string;   // tailwind text+border colour
  icon: string;
}

export function tierBadge(tier: QualityTier | undefined): TierBadge {
  switch (tier) {
    case 'ok':
      return {
        short: '高度还原',
        long: '前段与中下游都较可信（回测全场误差 ≤6 位）',
        cls: 'text-green-400 border-green-500/40',
        icon: '✓',
      };
    case 'rough':
      return {
        short: '仅供娱乐',
        long: '推演仅供娱乐：本场要么名次随机（SC/事故/首圈主导），要么模型并不比直接看排位赛更准',
        cls: 'text-orange-400 border-orange-500/40',
        icon: '⚠',
      };
    case 'podium':
    default:
      return {
        short: '领奖台可信·中游随机',
        long: '领奖台/前段可信（且胜过直接看排位赛），中下游事件驱动（SC/进站运气）、仅供娱乐',
        cls: 'text-yellow-400 border-yellow-500/40',
        icon: '◑',
      };
  }
}
