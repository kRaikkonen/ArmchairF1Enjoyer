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
