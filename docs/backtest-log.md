# 回测记录

每条赛道回测完成后在这里追加一条。

## 格式
| 日期 | 赛道 | 赛季 | modelVersion | top5误差 | 全场误差 | top3时间误差 | 备注 |
|------|------|------|-------------|---------|---------|------------|------|
| 2026-04-18 | Bahrain | 2025 | schema-v1 | max=0 (all 0) | max=1 (HAD/ALO/STR/BOR ±1) | 0.0 s | 样本不足组合6个，见 fitMeta；DRS boost=-0.248s；dirtyAir penalty=0.000s（gap计算基于cumtime近似） |

## 验收标准
- top5 名次误差 ≤ 2 位
- 全场名次误差 ≤ 4 位  
- top3 完赛时间误差 ≤ 5 秒

未达标的赛道不允许在产品中可选。

---

## 2026-06-06 · 数据血缘修复 + TS 引擎诚实回测

### 1. 单一真实来源修复（PLAN §8.1）
之前 `models/tracks/2025/bahrain.json` 的 `results` 字段是**手填的**，且与 FastF1
不符——把 HAM 标成 DNF（实际 P5 完赛）、HUL 标成 P8（实际 DSQ）、还混入了没参加
本场的 COL（缺了 LAW）。测试文件里的 `ACTUAL_ORDER_2025` 则是**发车格顺序**被误标成
完赛结果。

修复：新增 `pipeline/src/results.py`，`results` 字段现在由 `build_track.py` 从
FastF1 `session.results` 直接派生（完赛顺序 / ClassifiedPosition / DNF·DSQ 状态）。
重新生成的 bahrain.json 已核验：HAM=P5 finished、HUL=DSQ、名单有 LAW 无 COL。

### 2. 两个"回测数字"必须分清

| 来源 | maxErr | 含义 | 可信度 |
|------|--------|------|--------|
| Python `backtest.py` | top5=0 / 全场=1 | PredTotalTime ≡ ActualTotalTime（mean residual 恒等式，§8.4） | **无验证价值**，是代数恒等 |
| TS 引擎 vs 真实完赛 | **全场 max=8** | 模拟终点 vs FastF1 真实完赛顺序，seed 42 | 这才是引擎真实精度 |

旧的 TS 测试断言 `maxErr ≤ 4` 比的是**模拟 vs 发车格**（基准用错），度量的是"引擎几乎
没挪动车"，不是精度。改成 vs 真实完赛后，诚实数字如下。

### 3. TS 引擎真实精度（Bahrain 2025，seed 42，无 What-If）
- **全场 maxErr = 8 位**（GAS：真实 P7 → 模拟 P15）
- top5 偏差：PIA Δ0 / RUS Δ0 / NOR Δ0 / LEC Δ3 / HAM Δ4
- 其它大偏差：ANT 真实 P11 → 模拟 P4（Δ7）、ALB P12 → P18（Δ6）
- 前 3 名（PIA/RUS/NOR）完全正确，中游开始发散

诚实结论：**top3 准、中下游误差大（最坏 8 位）**。这个数字远超旧验收标准（全场 ≤4），
但它是真实的。是否对 armchair 定位够用 / 改模型还是降低期望 = 待人类决策（PLAN §10）。
characterization 测试已把 maxErr=8 钉死（`simulate.test.ts` Test 2），防止未来悄悄漂移。

---

## 2026-06-06 · 引擎一致性诊断 + 去拐杖实验

### 1. §8.3 引擎一致性 —— 排除分叉，已加永久回归测试
受控诊断（`scripts/engine-consistency.ts`）：用 Python backtest 的同一回放结构
（真实策略，干圈换拟合预测），但干圈改用 **TS** `computeLapTime` 核心算。受控模式不改
任何引擎逻辑——常量 RNG `()=>0.5` 让噪声归零，`inDrsZone=false`/`gap=Infinity`/
`ersMode=neutral` 让 computeLapTime 退化成 Python 的 `sp+tyre+driverOffset`。

- **逐干圈 |TS − Python| = 0.000e+0（924 圈精确为零）** → 两套引擎核心 bit 级一致。
- 已把这个断言提升为默认套件里的永久测试 `web/src/engine/consistency.test.ts`
  （golden 由 `controlled_consistency_dump.py` 从 Python 生成），verify.sh 强制。
- 结论：maxErr=8 **不是** §8.3 引擎不一致，是 forward-sim 产品逻辑（贪心 AI 策略发散）。

### 2. 去拐杖：`fit_driver_offsets` mean → median（§8.4）
旧实现用 `.mean()` 残差，强制 Σ=0 → 预测总时间恒等于真实 → 回测"全场 ≤1 / top3 时间 0.0s"
是代数恒等，无验证价值。改成 **median(actual − predicted)** 后，诚实数字浮现：

| 指标 | 旧（mean，拐杖） | 新（median，诚实） |
|------|----------------|--------------------|
| Python 回测 top5 max | 0 | 1 |
| Python 回测 全场 max | 1 | **5** |
| Python 回测 top3 时间 max | 0.0 s（恒等） | **1.76 s**（真实） |

> ⚠️ 诚实模型**不达现行验收门禁**（全场 5 > 4）。门禁该放宽还是该改模型 = 人类决策
> （PLAN §10）。本次用 `regen_bahrain_honest.py` 绕过门禁导出诚实模型供测量，门禁本身
> 未改动，数字如实上报。

### 3. 三个 maxErr 并列（诚实 median 模型，vs FastF1 真实完赛）

| 场景 | maxErr | 说明 |
|------|--------|------|
| (a) 诚实重演（真实策略，受控回放） | **5** | 模型真实精度，top3 时间误差 0.07–1.76s |
| (b) 诚实 forward-sim（贪心 AI，seed 42，无 What-If） | **8** | 比 (a) 多 3 位 = AI 策略发散代价 |
| (c) forward-sim + What-If（LEC 进站改到第 15 圈 HARD，seed 42） | **8** | 拉策略杆后量级不变，模型未崩 |

(b) 最坏来自 GAS（P7→P15）、ANT（P11→P3）并列 Δ8。(c) 是反事实，"vs 真实完赛"非纯精度，
重点是量级稳定（没爆）。`simulate.test.ts` characterization 仍为 8（去拐杖后最坏值未变，
因为 forward-sim 本就没吃到 §8.4 恒等的好处），已更新注释记录。
