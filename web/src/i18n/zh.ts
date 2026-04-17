/**
 * Chinese (Simplified) locale strings — i18n keys for MFD UI.
 * All user-facing text must come from here, never hardcoded in components.
 */
export const zh: Record<string, string> = {
  // ── App ──────────────────────────────────────────────────────────────
  'app.title':                'ARMCHAIR PITWALL',

  // ── HUD bar ──────────────────────────────────────────────────────────
  'hud.player':               '操控',
  'hud.position':             '排位',
  'hud.tire':                 '轮胎',
  'hud.gap':                  '差距',
  'hud.nextPit':              '进站',
  'hud.lapOf':                '第 {lap} 圈 / {total}',
  'hud.status.green':         '绿旗',
  'hud.status.sc':            '安全车',
  'hud.status.vsc':           '虚拟安全车',
  'hud.status.rain':          '雨天',

  // ── Event bar ────────────────────────────────────────────────────────
  'event.addVar':             '添加变量',
  'event.sc':                 '安全车 SC',
  'event.vsc':                '虚拟安全车 VSC',
  'event.rain':               '雨天',
  'event.teamOrder':          '车队指令',
  'event.pitError':           '维修失误',
  'event.pitErrorSec':        '{sec}s',
  'event.gunFailure':         '换胎枪故障',
  'event.penalty':            '罚时',
  'event.penaltyLabel':       '压线超界 +{sec}s',
  'event.activate':           '激活',

  // ── Driver list ──────────────────────────────────────────────────────
  'drivers.title':            '点击切换操控车手',
  'drivers.leader':           '领跑',

  // ── Gap chart ────────────────────────────────────────────────────────
  'chart.title':              '间距图 — GAP CHART',
  'chart.track':              '{track}赛道',
  'chart.lapAxis':            '圈',
  'chart.gapAxis':            '差距 (s)',
  'chart.compound.soft':      '软',
  'chart.compound.medium':    '中',
  'chart.compound.hard':      '硬',
  'chart.uncertainty':        '±不确定性区间',

  // ── Pit console ──────────────────────────────────────────────────────
  'pit.lapLabel':             '进站圈数',
  'pit.lapValue':             '第 {lap} 圈',
  'pit.tireLabel':            '出站轮胎',
  'pit.tireOption':           '{name} ({compound}) 寿命{life}圈',
  'pit.engineLabel':          '引擎模式',
  'pit.engine.standard':      'Standard — 标准（基准）',
  'pit.engine.attack':        'Attack — 激进',
  'pit.engine.save':          'Save — 节能',
  'pit.tempLabel':            '路面温度',
  'pit.tempValue':            '{temp}°C',
  'pit.runBtn':               '重新推演 ▶',
  'pit.tireHealth':           '轮胎健康度预测（出站后）',
  'pit.health.soft':          '软',
  'pit.health.medium':        '中',
  'pit.health.hard':          '硬',

  // ── Radio log ────────────────────────────────────────────────────────
  'radio.title':              '车队电台',
  'radio.from.fia':           'FIA 干事查',
  'radio.from.ai':            'AI 策略',
  'radio.from.driver':        '车手',
  'radio.from.engineer':      '工程师',
};
