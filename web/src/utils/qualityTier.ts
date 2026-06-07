/**
 * Honest quality-tier presentation, shared by the race list and the MFD banner.
 *
 * The midfield is event-driven (safety cars, pit luck, first-lap incidents) and
 * not predictable from pace, so we grade per race instead of a flat "数据不足":
 *   ok     — front AND midfield faithful (rare).
 *   podium — podium/front trustworthy, midfield is a dice roll (most races).
 *   rough  — even the front is shaky; for fun only.
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
        short: '名次随机·仅供娱乐',
        long: '本场名次由安全车/事故/首圈/进站运气主导，连前段都难复现，仅供娱乐',
        cls: 'text-orange-400 border-orange-500/40',
        icon: '⚠',
      };
    case 'podium':
    default:
      return {
        short: '领奖台可信·中游随机',
        long: '领奖台/前段较可信，中下游事件驱动（SC/进站运气）、仅供娱乐',
        cls: 'text-yellow-400 border-yellow-500/40',
        icon: '◑',
      };
  }
}
