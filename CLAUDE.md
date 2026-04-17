# F1 Armchair Pitwall — 项目总则

## 这是什么

基于 FastF1 真实 2025 赛季数据的 F1 策略推演 Web App。
用户选一场比赛、选车手、注入 What-If（改进站/加罚时/SC/VSC/雨天），看另一种结局。

定位是 armchair 玩具，不是 race strategist 软件。
模型求"看起来像 F1"，不求赛车工程师级精度。

详细 brief 见 `docs/brief.md`。
物理模型见 `docs/physics-model.md`。

## 当前阶段

**Phase 0**：数据管道 + 引擎最小闭环。
目标：`models/tracks/2025/bahrain.json` 产出并通过回测。

**Phase 0 完成前，禁止写任何前端业务代码。**

阶段任务清单：`tasks/phase-0-bahrain.md`
做完每一步后更新里面的 checkbox 并记录数字。

## 每次交付前必跑

```bash
bash scripts/verify.sh
```

不过这关不要说"做完了"。

## 硬规则（6条，不多，每条都是真的会伤产品的）

1. `web/src/engine/**` 禁止硬编码物理常数。所有物理参数从 TrackModel JSON 读取。
   schema 常数、统计阈值、UI 常数不算，可以硬编码但必须有注释说明为什么不是 fit 出来的。
2. 禁止 `Math.random()`。用 `seedrandom` 封装的 PRNG（`web/src/engine/rng.ts`）。
3. 禁止 `Date.now()` / `performance.now()` 进入 engine 层。
4. 拟合遇到样本不足/数据缺失，必须在日志中报告，禁止用默认值填充。
5. Commit message 格式：`phase-0: <what changed>`
6. 每条赛道回测数字必须记录到 `docs/backtest-log.md`。

## 你可以自主决定

- 代码组织、文件拆分
- 库的细节选择（框架内）
- 测试结构
- bug 修复思路

## 必须停下来问人类

- 拟合方法选择（线性 vs 指数 vs 分段）
- 样本不足时具体 fallback 策略
- 回测不达标时是改模型还是删赛道
- 与本文件任何规则冲突的情况
- 产品决策（UI 文案、卡片场景、可视化风格）

## 环境

- Python 3.10，conda env 名：f1apt
- 项目根目录：~/projects/armchair-pitwall
- FastF1 cache 目录：pipeline/cache/（已在 .gitignore）

## 常用命令

```bash
# 验证
bash scripts/verify.sh

# 构建 Bahrain 模型
conda run -n f1apt python pipeline/scripts/build_track.py bahrain 2025
```
