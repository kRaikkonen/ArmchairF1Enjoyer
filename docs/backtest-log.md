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

---

## 2026-06-07 · 跨赛道 holdout（验证债 #3）+ 引擎体感强化

### 1. 跨赛道 holdout —— 模型不泛化（重要诚实结论）
`holdout_saudi.py`：用 Bahrain 拟合参数预测 Saudi 2025，对比 Saudi 自身拟合（in-sample）。

| | top5 max | 全场 max |
|---|---|---|
| in-sample（Saudi 模型 → Saudi） | 4 | 14 |
| **HOLDOUT（Bahrain 模型 → Saudi）** | **10** | **12** |

**Bahrain 的车手/轮胎特征不迁移到 Saudi**（top5 误差 10 位）。而且 Saudi 连自身 in-sample
全场误差都到 14——基于累积时间的位置模型在超车多/方差大的赛道更吃力。结论：**每条赛道必须
各自拟合**（数据从 FastF1 自动派生），且精度逐赛道差异很大（Bahrain ~4-6，Saudi ~14）。
上架别条赛道前应记录其 in-sample 数字，并对精度差的赛道打"数据不足/仅供参考"标。

### 2. 引擎体感（不影响诚实数字）
- 脏气流/DRS 拟合塌到 0 → 引擎层 armchair 下限（脏气流 ≥0.4s、DRS ≤−0.3s）+ 出站冷胎 +1.3s，
  复活"跟车/超车/undercut"张力。§8.3 受控模式仍把这些归零，golden 不变。
- 巴林真实复现误差因为这层摩擦反而**从 6 改善到 4**。
- 对手博弈（reactive AI）：对手会防守 undercut / 安全车抢停 / 雨天换胎；无干预时精确复现真实（偏差 0）。

---

## 2026-06-07 · 全季 onboarding（18 场常规赛）+ 诚实精度门槛

`onboard_season.py` 拉取并构建 2025 全部 18 场常规赛（非冲刺）。每场 **in-sample**
（自身拟合→自身回测）数字如下。门槛：top5≤2、全场≤6、top3 时间≤5s 三项全过才记 `ok`，
否则 `limited` 并在 UI 打"数据不足/仅供参考"标（不再 hard-fail 删赛道，PLAN §10 决策）。

| 轮次 | 赛道 | top5 max | 全场 max | top3 时间(s) | 评级 |
|---|---|---|---|---|---|
| R1 | australian | 1 | 3 | 7.22 | limited |
| R3 | japanese | 3 | 16 | 0.76 | limited |
| R4 | **bahrain** | 1 | 5 | 1.76 | **ok** |
| R5 | saudi-arabian | 4 | 14 | 5.73 | limited |
| R7 | emilia-romagna | 7 | 7 | 4.49 | limited |
| R8 | monaco | 4 | 12 | 11.67 | limited |
| R9 | spanish | 3 | 3 | 3.88 | limited |
| R10 | canadian | 11 | 11 | 3.53 | limited |
| R11 | austrian | 11 | 15 | 1.21 | limited |
| R12 | british | 2 | 12 | 5.22 | limited |
| R14 | hungarian | 10 | 12 | 2.30 | limited |
| R15 | dutch | 13 | 13 | 12.91 | limited |
| R16 | italian | 5 | 14 | 3.76 | limited |
| R17 | azerbaijan | 7 | 17 | 4.25 | limited |
| R18 | singapore | 6 | 11 | 9.14 | limited |
| R20 | mexico-city | 7 | 14 | 0.70 | limited |
| R22 | las-vegas | 1 | 14 | 2.50 | limited |
| R24 | abu-dhabi | 5 | 16 | 7.37 | limited |

**结论（诚实）**：18 场里只有 **Bahrain 过门槛**，其余 17 场全 `limited`。这与 #3 跨赛道
holdout 的结论一致——基于累积时间的位置模型在超车多/方差大的赛道吃力，单赛道拟合也难压住
全场误差。产品对策不是藏，而是**逐场打标**：领奖台尚可看，中下游仅供娱乐。

**修复（本轮 audit 发现）**：Australian / British 是仅有的两场雨战，FastF1 把中性胎拼作
`INTERMEDIATE`，而引擎/UI 契约是 `INTER`——湿胎被错当光头胎吃 15s/圈 罚时、AI 误换胎、
徽章显示 `?`。已在 `build_track.py` 读 parquet 后统一 `INTERMEDIATE→INTER`，两场重建验证无残留。

---

## 2026-06-07 · 脏气流拟合修复（真实车距）+ 位置模型实验

### 1. 脏气流拟合是坏的——两个 bug，已修
`_compute_gap_ahead` 同时有两处错误，导致脏气流在 10/18 场塌成 0：
- **车距用 cumsum(lap times) 估算**：忽略发车格/起跑时间偏移，且每次进站/SC 漂移 → 不是真实在赛道上的车距。
- **index 错位**：函数内部 `reset_index` 后返回的 Series 与调用方 `clean` 的原始 index 不对齐，pandas 按值对齐 → 车距被赋到错误的行 → 拟合成噪声。

修法：直接用 FastF1 每圈的真实 `Time`（冲线时刻）算车距 = 我的 Time − 前车（Position−1）的 Time，并保持 index 对齐。**数据早就在 fixtures 里**（`Position`+`Time` 列），不用重新拉。

修复后脏气流值变得物理合理（s/圈）：

| 赛道 | 修前 | 修后 | 说明 |
|---|---|---|---|
| monaco | 0.00 | **2.33** | 最难超车，跟车惩罚最大——修前竟是 0 |
| british | 0.00 | 0.76 | 高速弯街道感 |
| singapore | 0.75 | 0.75 | 街道 |
| canadian | 0.00 | 0.61 | |
| azerbaijan | 0.00 | 0.44 | |
| bahrain | 0.00 | 0.00 | 宽、易超车——正确地接近 0 |

引擎在 `computeLapTime` 里对跟车的车加这个惩罚并按累积时间排名，所以**修复后引擎天然有了"跟车卡住/难超车"的物理**（尤其 Monaco），不再是 0 摩擦。§8.3 受控模式 gap=Inf 不吃脏气流，golden 不变。

### 2. 位置模型实验——能修领奖台，修不了中下游（重要诚实结论）
原型：逐圈前向模拟，跟车的车吃脏气流惩罚、按累积时间排名（镜像引擎），对比"纯 pace 求和"回测：

| 赛道 | 纯pace top5/all | 位置模型 top5/all |
|---|---|---|
| canadian | 11/11 | **4**/11 |
| singapore | 6/11 | **3**/12 |
| mexico-city | 7/14 | **5**/14 |
| japanese | 3/16 | **1**/16 |
| azerbaijan | 7/17 | **6**/17 |

**位置模型显著改善领奖台/前段（top5），但全场误差（all）几乎不动（仍 11–17）。**

原因诚实讲：中下游名次主要由**安全车时机、进站运气、首圈混乱、罚时**这些事件决定，不是 pace 能预测的。任何确定性 pace 模型都无法把这些预测进 ±6。所以多数 2025 场次在严格 `all≤6` 门槛下**注定 limited**——这不是 bug 也不是偷懒，是赛车本身的随机性。**把它们硬刷成"ok"就是自欺**（违反项目核心原则）。

### 3. 位置模型接入回测 + 诚实分级（替代二元 ok/limited）
`backtest()` 改为位置感知前向模拟（`_position_aware_totals`）：逐圈按累积时间排序，
跟车的车吃脏气流惩罚，按发车格 seed。net 改善领奖台（top5 更准 10 场、变差 2 场）。
据此改成三档诚实分级（不再一刀切"数据不足"）：

- **ok 高度还原**（top5≤2 且 全场≤6）：bahrain, spanish。
- **podium 领奖台可信·中游随机**（top5≤3）：japanese, las-vegas, dutch, british, monaco, saudi-arabian, singapore。
- **rough 名次随机·仅供娱乐**（top5>3）：abu-dhabi, australian, austrian, azerbaijan, canadian, emilia-romagna, hungarian, italian, mexico-city。

**2 ok / 7 podium / 9 rough**。比"1 ok / 17 数据不足"诚实得多——9 场领奖台可信，其余如实标"仅供娱乐"。

### 4. 薄弱胎拟合格用练习/排位补齐（FP/Q supplementation）
拉了全 24 场的练习（FP1/2/3）+ 排位（Q/SQ）圈（仅圈速，不含遥测，`fetch_support.py`）。
发现真正的"数据不足"症状：某队某胎只跑了 2 圈时，分段拟合给出**垃圾 deg**——
Ferrari|MEDIUM **−3.39**s/圈（轮胎越跑越快）、Racing Bulls|INTER **NaN**，而引擎照单全收。

修法（保守，`fit._supplement_thin_cell`）：薄弱格**保留赛中 pace 截距不动**，只在 deg 物理上
不可能时（NaN / <−0.15 / >0.8）替换为「赛+练长跑的 stint-relative 斜率 → 该胎跨队中位 deg → 0」，
并 clamp。截距不动是关键——之前重锚 pace 会让回测排名乱掉。结果：

- **薄弱格垃圾 deg 清零**（24 场 0 个 NaN/越界）。
- 净影响诚实：belgian podium→rough（它的领奖台本就是垃圾 deg 撑出来的，rough 才诚实）。
- **巴林前向模拟 maxErr 8→4**（脏气流修复 + deg 不再被过度外推），§8.3 golden 重生、特征化更新。

**没动充足格（n≥20）的怪 deg**：有些是真信号（如澳/雨战 INTER −1.2s/圈 = 干道变干，inter 越来越快），
clamp 它们反而错。这类留作未来「分段湿胎模型」议题。

---

## 2026-06-07 · 独立审计 + 网格基线（最重要的诚实修正）

一轮独立多 agent 审计（`严谨客观`）发现两个致命问题：

1. **两个模型 NaN 崩溃**：british/mexico-city 的某胎 intercept = NaN（无效 JSON），用户一选就白屏崩溃；而所有测试只加载巴林，所以没人发现。修：`_supplement_thin_cell` 截距非有限时回退到稳健中位；`export.py` 用 `allow_nan=False` 在 build 期硬失败；新增 `all-models.test.ts` 把 24 场全部 JSON.parse+simulate（12→37 测试）。

2. **模型输给"直接抄发车格"基线**：审计重建对比发现，多数场次里 grid-order 空模型（预测=发车顺序）在全场名次上**比我们的模型还准**（Spearman grid~actual 在每条赛道都高于 pred~actual）。"领奖台可信"标签很大程度是在测量 F1 前排"粘性"，不是模型本事。

修法（`backtest.py` + `build_track.grade`）：回测新增 **grid-order 空模型**列（top5/all），并规定**任何宣称可信的档位必须在 gated top5 指标上 ≥ 网格基线**，否则降到 rough。诚实重判：

**3 ok / 10 podium / 11 rough → 3 ok / 5 podium / 16 rough**。模型只在 **10/24** 场 top5 上 ≥ 网格。

留下的 ok/podium 是**真挣来的**：sao-paulo 网格偏 13 位、模型偏 2；las-vegas 网格 8、模型 1；british 网格 7、模型 2。这些是发车格被打乱、而 pace 模型真的预测对了领奖台的场次——模型的真信号所在。rough 标签改成诚实覆盖两种情况（随机 / 或没胜过看排位）。
