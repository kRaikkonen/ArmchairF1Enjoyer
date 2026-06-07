# 物理模型说明

## 核心公式
lapTime(driver, lap, context) =
trackBasePace                             // 赛道基准圈速（中位干圈）

stintProgressCoef * lapsSinceStart        // 见下方说明
tyreDeg(compound, stintLap)               // 轮胎衰减


drsBoost(inDrsZone, gapAhead)             // DRS 增益（注意是减法）


dirtyAirPenalty(gapAhead)                 // 脏气流损失
ersDelta(ersMode)                         // ERS 三档
driverOffset(driverId)                    // 车手水平偏置
weatherDelta(trackTemp, isWet)            // 天气修正
seededNoise(seed, driverId, lap)          // 确定性小扰动


## 各项说明

### stintProgressCoef
**命名说明**：故意不叫 fuelCoef。
这个系数吸收了多个耦合效应：
- 燃油减轻（圈速变快）
- 赛道升级/橡胶铺设（圈速变快）
- 早期胎温未饱和（圈速偏慢）
- ERS 早圈保守部署（圈速偏慢）
FastF1 不提供真实燃油装载量，无法分离上述效应。
拟合方法：对"干圈、非 SC/VSC、非 pit 进出"的圈做
lapsSinceStart（全场圈数）→ cleanLapTime 线性回归，斜率即此系数。
通常为负值（越跑越快），量级约 -0.05 ~ -0.15 s/lap。

### tyreDeg(compound, stintLap)
按 (track, team, compound) 三元组拟合。
基础形式：linear + cliff
  deg = degLinear * stintLap + cliff(stintLap)
cliff 函数：stintLap 超过 cliffStart 后额外加速衰减。
样本 < 20 圈的组合标记 insufficient=True，不参与推演，在日志中列出。

### drsBoost
gap < 1.0s 且车辆进入 DRS zone 时，给一个固定负值（圈速变快）。
从 sector 时间对比拟合：DRS 可用 vs 不可用的直道 sector delta 均值。
**armchair 下限 −0.3s**：gap 由累积时间估算精度不足时拟合会塌到 0（巴林即如此），
此时用引擎层的 armchair 占位下限 `min(拟合值, −0.3)`，注释标注非拟合（硬规则 1 例外）。

### dirtyAirPenalty
粗分两档：gap < 1.5s 有脏气流损失（正值），gap ≥ 1.5s 无。
**armchair 下限 +0.4s**：同 DRS，拟合塌到 0 时用 `max(拟合值, 0.4)`，否则"能不能跟车/超车"
这一层物理是死的。配合 DRS：跟车 +0.4、有 DRS 时 −0.3 抵掉大半，呈现"卡在 DRS 区超不过去"。

### 出站冷胎 + 雨胎
- **出站冷胎**：每段第一圈 +1.3s（armchair 常数），让 undercut 是赌注不是免费午餐。
- **INTER/WET 无拟合**（干赛）：用 `trackBasePace + 2.0 + 0.04*stintLap` 当合成胎况，干湿差异在 weatherDelta。

### ERS 电池模型（armchair，按 2025 真实规则）
电池（Energy Store）容量 4 MJ；每圈最多回收 2 MJ；MGU-K 每圈最多部署 4 MJ。
所以满功率部署比回收快，电池约 2 圈耗尽——**不可能整场激进**。

每圈：电池 += 回收(2) − 部署，clamp 到 [0, 4]。部署目标按档位：
- attack：满部署 4 MJ（电池足时 ≈ −0.4s，约 2 圈耗尽后退化到中性、无增益）
- neutral：部署 2 MJ（= 回收，电池稳定），无增益
- save：部署 1 MJ，回充电池，圈速 +0.1s（略慢）

圈速 delta = −0.2s/MJ（高于中性部署）或 +0.1s/MJ（低于中性）。
这些是规则推导的架构常数（非拟合，符合硬规则 1）。不模拟 MGU-H、不模拟单圈内部署曲线。

### driverOffset
每个车手相对车队均值的圈速偏置（秒/圈）。
正值 = 比车队均值慢，负值 = 比车队均值快。
从该车手所有干圈 vs 同车队均值的 delta 中位数拟合。

### seededNoise
每圈注入小幅确定性扰动，模拟真实比赛的微观随机性。
用 seedrandom 生成，seed 由 (globalSeed, driverId, lap) 组合派生。
量级约 ±0.05s，正态分布截断。
**禁止使用 Math.random()。**

## 已知局限

1. stintProgressCoef 无法分离燃油与赛道升级效应
2. 脏气流模型不区分赛道几何（高速弯影响更大）
3. ERS 是 MJ 电池模型（4MJ 容量 / 2MJ 回收/圈），但增益系数是启发式估计，非拟合
4. 轮胎暖胎圈（out-lap）被清洗掉，undercut 物理是近似
5. 不建模 DNF / reliability
6. 不建模 pit crew 方差（pit loss 是均值，不是分布）
7. 不适用于 2026+ 赛季（active aero / 新动力单元）
