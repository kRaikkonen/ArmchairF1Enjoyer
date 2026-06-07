# F1 Armchair Pitwall — 微信小程序

复用 Web 版**完全相同的纯 TS 引擎**（编译为 CommonJS），在小程序里复现真实比赛、接管车手、改一次进站看结局。无 mock 数据。

## 结构

```
miniprogram/
├── app.json / app.js / app.wxss     # 全局配置 + F1 暗色主题
├── project.config.json              # DevTools 配置（appid 用 touristappid，请换成你自己的）
├── pages/
│   ├── home/                        # 赛事清单（24 场，三档诚实质量标）
│   └── mfd/                         # 实时名次 + 间距图(canvas) + 进站 What-If + 分享
├── lib/                             # ← 生成物：编译后的引擎 + 工具 + vendored seedrandom
└── data/                            # ← 生成物：24 场模型 JS 模块 + manifest + loader map
```

`lib/` 和 `data/` 是**生成的**，不要手改。改了引擎或重建模型后，重新生成：

```bash
node scripts/build-miniprogram.mjs      # 编译引擎(tsc→CommonJS) + vendor seedrandom + 打包数据
node scripts/verify-miniprogram.mjs     # 无头验证：24 场全部 load+build+simulate+What-If 不崩、无 NaN
```

## 打开 / 预览

1. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 先跑一遍 `node scripts/build-miniprogram.mjs`（确保 `lib/`、`data/` 是最新的）。
3. DevTools → 导入项目 → 选择本 `miniprogram/` 文件夹。
4. `project.config.json` 里 `appid` 是占位的 `touristappid`（游客预览）。上架前换成你自己的 AppID。

## 与 Web 版的关系

- **同一个引擎**：`scripts/build-miniprogram.mjs` 用 `web/tsconfig.miniprogram.json` 把 `web/src/engine/*` + `buildDrivers`/`raceFactsEvents`/`qualityTier` 编译进 `lib/`，并 vendoring `seedrandom`，所以确定性与数值与 Web 一致。
- **同一份数据**：`data/` 由 `web/public/models/tracks/2025/*.json` 生成。
- **诚实分级一致**：home 的徽章用同一个 `tierBadge`（ok/podium/rough，且 podium/ok 必须胜过"直接看排位赛"网格基线）。

## 已知限制（诚实）

- WXML/WXSS 渲染只在 DevTools 里可视；本仓库的验证是**无头逻辑验证**（引擎+数据+页面逻辑路径），UI 细节需在 DevTools 里走查。
- MFD 目前是 MVP：实时名次、间距图、单车手改一次进站。Web 版的多车手累积 What-If、SC/VSC/雨/罚时多事件、赛道地图、ERS 模式尚未移植。
- 引擎里的 ERS/进站常数是 2025 规则；2026 需另行重写（见根 README 路线图）。
