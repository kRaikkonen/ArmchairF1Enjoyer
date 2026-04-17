# F1 Armchair Pitwall — Development Plan

> 基于 Project Brief v3 (2025 单季 · 快速迭代版)
> 生成日期: 2026-04-17

---

## 项目定位概要

**F1 策略推演 Web App**：基于 FastF1 真实 2025 赛季数据，允许球迷注入 What-If 事件（进站、罚时、SC/VSC、雨天、维修失误）推演另一种结局。

- 目标受众：F1 车迷、赛后复盘党
- 传播：Web 链接分享 → 微博/小红书/X
- 预留微信小程序移植空间，第一版不做

---

## 范围边界

| 范围 | 决策 |
|------|------|
| 赛季 | 2025 赛季（2022-2024 仅 sanity check） |
| 赛事类型 | 传统周末正赛，Sprint 排除 |
| 赛道 | 8-12 条热门赛道（Bahrain、Jeddah、Suzuka、Miami、Imola、Monaco、Spain、Canada、Silverstone、Hungary、Spa、Monza 中选） |
| 2026 | 不做 |

---

## Phase 0：数据 + 引擎最小闭环

**目标时间：2-3 周**
**出口条件：Bahrain 2025 回测通过后停下来汇报，人类确认后才开始其他赛道。**

### Step 0.1 搭骨架

- [ ] 建 repo，创建目录结构（见下方）
- [ ] `pipeline/` 用 uv init，依赖：fastf1、pandas、numpy、scikit-learn、pytest
- [ ] `web/` 用 `pnpm create vite` + React-TS 模板
- [ ] 写 `CLAUDE.md`（项目工作准则）
- [ ] 写 `scripts/verify.sh`（pipeline pytest + web typecheck + web test + backtest-sanity）

```
armchair-pitwall/
├── CLAUDE.md
├── README.md
├── pipeline/
│   ├── pyproject.toml
│   ├── src/
│   │   ├── fetch.py
│   │   ├── clean.py
│   │   ├── fit.py
│   │   ├── backtest.py
│   │   └── build_track.py
│   ├── tests/
│   └── cache/                  # .gitignore
├── models/
│   ├── manifest.json
│   └── tracks/2025/
│       └── bahrain.json
├── web/
│   ├── src/
│   │   ├── engine/
│   │   │   ├── types.ts
│   │   │   ├── lapTime.ts
│   │   │   ├── simulate.ts
│   │   │   ├── events.ts
│   │   │   ├── ai.ts
│   │   │   └── rng.ts
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── locales/
│   │   └── App.tsx
│   └── package.json
└── scripts/
    ├── verify.sh
    └── build-all-tracks.sh
```

---

### Step 0.2 数据管道闭环（仅 Bahrain 2025）

每个函数配一个 pytest，顺序实现：

| # | 函数 | 说明 |
|---|------|------|
| 1 | `fetch_race(year, round_or_name) -> Session` | FastF1 拉数据，cache 到 `pipeline/cache/` |
| 2 | `clean_laps(session) -> DataFrame` | 剔除 in/out/SC/VSC/pit/异常；打标 `stintId, compound, tyreAge, gapAhead, hasDrs` |
| 3 | `fit_stint_progress(laps) -> StintProgressModel` | 线性回归 lapsSinceStart vs cleanLapTime；命名不叫 fuelCoef |
| 4 | `fit_tyre_deg(laps) -> dict[(team,compound), TyreDegModel]` | 样本<20圈标 `insufficient=True` 并在日志中列出 |
| 5 | `fit_dirty_air(laps) -> DirtyAirModel` | 按 gapAhead 分两档（<1.5s / 其他），各自求圈速 delta 均值 |
| 6 | `fit_drs_boost(laps) -> DrsBoostModel` | 对比 DRS 可用 vs 不可用的直道 sector 时间，求平均减法 |
| 7 | `fit_driver_offsets(laps) -> dict[driverId, float]` | 每车手相对车队均值的圈速偏置 |
| 8 | `backtest(track_model, session) -> BacktestReport` | 真实发车 + 真实进站，无 What-If，比终点误差 |
| 9 | `export_track(track_model, path)` | 产出 `models/tracks/2025/bahrain.json`，符合 schema v1 |
| 10 | `scripts/build_track.py bahrain` | 串起全流程，回测不过退出码 1 |

**出口条件**（必须全部满足才算通过）：
- `models/tracks/2025/bahrain.json` 成功产出
- 回测前 5 名名次误差 ≤ 2 位
- 全场名次误差 ≤ 4 位
- 前三完赛时间误差 ≤ 5s

---

### Step 0.3 引擎闭环（纯 TS，无 React/DOM 依赖）

实现 `web/src/engine/` 下各模块：

| 文件 | 职责 |
|------|------|
| `types.ts` | `TrackModel`、`RaceState`、`DriverState`、`EventEffect` 等类型定义 |
| `rng.ts` | 封装 seedrandom，禁止裸 `Math.random()` |
| `lapTime.ts` | 实现圈速公式，所有物理参数从 `TrackModel` 读取，无硬编码数字 |
| `simulate.ts` | 完整比赛推演（逐圈循环） |
| `events.ts` | SC/VSC/penalty/pit/rain 作为 EventEffect |
| `ai.ts` | 简化 AI 进站决策（基于 pitLoss + tyreDeg 判断"值不值得进") |

**圈速公式**：

```
lapTime(driver, lap, context) =
    trackBasePace
  + stintProgressCoef * lapsSinceStart
  + tyreDeg(compound, stintLap)
  + dirtyAirPenalty(gapAhead, inCorner)
  - drsBoost(inDrsZone, gapAhead)
  + ersDelta(ersMode)
  + driverOffset(driverId)
  + weatherDelta(trackTemp, wet)
  + noiseSeeded(seed, driver, lap)
```

**ERS 池子模型**：
- `attack` → 扣 1.5x 预算，给 -0.15s/lap 增益
- `neutral` → 扣 1x 预算
- `save` → 扣 0.5x 预算，不给增益但回收到后续

**vitest 测试用例**（必须全过）：

- [ ] 同 seed 两次运行结果完全相等
- [ ] 喂 Bahrain 2025 模型，无事件注入，终点顺序与真实结果误差 ≤ 4 位
- [ ] DRS 增益只在 gap<1s 且在 zone 内生效
- [ ] ERS 池子不能为负

---

### Step 0.4 验收并汇报人类

`scripts/verify.sh` 全绿后，停下来汇报以下内容（**人类确认后才开始拟合其他赛道**）：

- [ ] 实际回测数字（前 5 名名次误差、top3 时间误差）
- [ ] 样本不足的车队/胎组合列表
- [ ] 发现的数据异常
- [ ] 对模型局限的认识与已知缺陷

---

## Phase 1：前端 MVP

**目标时间：1-2 周（Phase 0 通过后开始）**
**前提：至少 3 条赛道回测通过**

### 主流程（移动端优先）

1. **首屏**：3 条赛道卡片"一键推演"
2. **流程**：选比赛 → 选车手 → 选 What-If
3. **推演动画**：~10 秒位次变化（Chart.js）
4. **结果页**：真实结果 vs 推演对比图 + 可分享卡片

### 高级模式（桌面二级入口）

- 三栏：左车手、中赛道+Gap chart、右电台日志
- 顶部事件条
- 信息密度要上去，不强求 MFD 风格

### 分享功能

- [ ] 生成 9:16 和 16:9 截图（html2canvas）
- [ ] URL 参数格式：`?track=bahrain&player=VER&events=...&seed=12345&modelVersion=v1`
- [ ] 同链接打开必须产出一致结果（seeded PRNG）
- [ ] 跨浏览器差异时提示"结果近似"

### 页脚（常驻）

```
模型版本 v1 · 基于 2025 Bahrain GP 数据 · 回测前 5 名误差 ±N 位
Data courtesy of FastF1. Not affiliated with F1, FIA, or any team.
```

---

## Phase 2：打磨 + 扩赛道（持续迭代）

- [ ] 每新增赛道：走 `build_track.py <name>` + 人类验收
- [ ] 经典场景卡片（附真实新闻来源链接）
- [ ] 中英双语（填之前埋好的 i18n keys）
- [ ] 性能优化：移动端 57 圈 × 20 车 ≤ 2s

---

## 技术栈

| 层 | 选型 |
|----|------|
| Python 数据管道 | Python 3.11 / uv / fastf1 / pandas / numpy / scikit-learn / pytest |
| 前端 + 引擎 | Vite + React 18 + TS strict / Zustand / Chart.js / Tailwind / seedrandom / i18next |
| 部署 | Vercel（前端 + 模型 JSON 静态托管） |
| 本地开发 | pnpm + Node 20+；Python 用 uv 或 venv |

---

## 模型参数原则

**必须有来源元数据**：所有 `TrackModel` JSON 中的物理参数须附带：
- `source`：来自哪些场次
- `sampleCount`：样本数
- `r2`：拟合质量

**不允许**：`lapTime.ts` 中出现硬编码物理数字

---

## Claude Code 工作准则

### 自主决定（无需问）
- 代码实现、框架内技术选型
- 文件组织、bug 修复
- 测试结构

### 必须停下来问
- 产品文案、卡片场景选择、UI 取舍
- 拟合方法学选择（线性 vs 指数衰减等）
- 样本不足时具体用哪种 fallback
- 回测不达标时是改模型还是踢出该赛道
- 任何与 brief 原则冲突的情况

### 严格禁止
- `lapTime.ts` 中出现硬编码物理数字
- 使用 `Math.random()`（必须 seeded）
- 拟合时"估一个差不多的值"填充缺失数据（必须明确报告）
- 跳过 `scripts/verify.sh`
- Phase 0 回测通过前写任何前端业务代码（脚手架可以）

---

## 回测门禁阈值（硬性）

| 指标 | 阈值 |
|------|------|
| 前 5 名名次误差 | ≤ 2 位 |
| 全场名次误差 | ≤ 4 位 |
| 前三完赛时间误差 | ≤ 5s |

达不到 → 不上架，停下来汇报。

---

## 当前状态

- [x] Project Brief v3 确认
- [ ] **Step 0.1**：搭骨架（待开始）
- [ ] Step 0.2：Bahrain 数据管道
- [ ] Step 0.3：TS 引擎
- [ ] Step 0.4：验收汇报
- [ ] Phase 1：前端 MVP
- [ ] Phase 2：扩赛道
