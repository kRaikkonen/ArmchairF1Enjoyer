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
典型值 -0.3 ~ -0.6 s/lap（赛道相关）。

### dirtyAirPenalty
粗分两档：
- gap < 1.5s：有脏气流损失（正值，圈速变慢）
- gap >= 1.5s：无惩罚
不做赛道细分（高速弯 vs 低速弯），armchair 精度够用。

### ERS 池子模型（简化）
每车每圈有 ersBudgetPerLap（从 TrackModel 读，按车队微差）。
三档：
- attack：消耗 1.5x budget，给 -0.15s 增益
- neutral：消耗 1.0x budget，无增益
- save：消耗 0.5x budget，无增益，回收到后续圈
池子不能为负（系统强制 clamp）。
不模拟 MGU-H/K，不精确到 MJ。

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
3. ERS 模型是桶模型，不反映真实 MGU-K 电流特性
4. 轮胎暖胎圈（out-lap）被清洗掉，undercut 物理是近似
5. 不建模 DNF / reliability
6. 不建模 pit crew 方差（pit loss 是均值，不是分布）
7. 不适用于 2026+ 赛季（active aero / 新动力单元）
