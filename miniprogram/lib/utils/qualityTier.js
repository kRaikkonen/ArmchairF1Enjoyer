"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tierBadge = tierBadge;
function tierBadge(tier) {
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
