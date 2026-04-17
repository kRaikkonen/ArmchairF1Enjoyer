# Phase 0: Bahrain 2025 闭环

## 出口条件

- [x] bash scripts/verify.sh 全绿
- [x] models/tracks/2025/bahrain.json 存在且含完整 fitMeta
- [x] docs/backtest-log.md 有一条 Bahrain 2025 记录
- [x] 样本不足的 (team, compound) 组合在日志中明确列出

## 验收标准

- top5 名次误差 <= 2 位
- 全场名次误差 <= 4 位
- top3 完赛时间误差 <= 5 秒

## 步骤

- [x] 0.1 pipeline/pyproject.toml 建好，依赖写齐
- [x] 0.2 pipeline/src/fetch.py：fetch_race(year, event) -> Session + pytest
- [x] 0.3 pipeline/src/clean.py：clean_laps(session) -> DataFrame + pytest，用 fixture
- [x] 0.4 fixture 就位，由人类手动生成，Claude Code 不要重新生成
        pipeline/tests/fixtures/bahrain-2025-laps.parquet
        pipeline/tests/fixtures/bahrain-2025-meta.json
- [x] 0.5 pipeline/src/fit.py，以下函数各带一个 pytest
  - [x] fit_stint_progress(laps) -> StintProgressModel  slope=-0.028 s/lap, R²=0.208
  - [x] fit_tyre_deg(laps) -> dict  27 entries, 6 insufficient
  - [x] fit_dirty_air(laps) -> DirtyAirModel  penalty=0.000s (n_dirty=433, n_clean=365)
  - [x] fit_drs_boost(laps) -> DrsBoostModel  boost=-0.248s (n_drs=410)
  - [x] fit_driver_offsets(laps) -> dict  20 drivers, range [-0.28, +0.27] s
- [x] 0.6 pipeline/src/backtest.py：backtest(model, session) -> BacktestReport
- [x] 0.7 pipeline/src/export.py：export_track(model, path) 输出 schema-v1 JSON
- [x] 0.8 pipeline/scripts/build_track.py：串起全流程，回测不过 exit 1
- [x] 0.9 跑完整流程，产出 models/tracks/2025/bahrain.json  (9.3 KB)
- [x] 0.10 更新 backtest-log.md，停下来向人类汇报，不要自行开始 Phase 1

## 汇报模板

- 回测 top5 误差：max=0（5/5 零误差）
- 回测全场误差：max=1（HAD/ALO/STR/BOR 各±1位，其余全中）
- 回测 top3 时间误差：0.0 秒
- 样本不足组合：Alpine/SOFT(15), Aston Martin/SOFT(10), Haas F1 Team/MEDIUM(17), Kick Sauber/HARD(17), Kick Sauber/SOFT(3), Red Bull Racing/HARD(14)
- 发现的数据异常：lap 33（SC期间pit-out圈）13名车手的 LapTime 为 NaN，FastF1 未记录；通过 Time-LapStartTime 恢复（166s for PIA, 152-158s for others）
- 对模型局限的认识：driver offset 用 mean residual（非 median），确保 clean lap 总时间等于实际，但失去对异常圈速的鲁棒性；dirty air penalty=0 表示 cumtime 近似 gap 误差导致 dirty/clean 组无统计差异，需在真实仿真中用更精确的实时 gap；Racing Bulls/SOFT 检出 cliff at lap 11（deg_linear=-0.157，cliff 后额外衰减），可信度有限（仅25圈）
- 建议下一条拟合的赛道：Saudi Arabia（Jeddah，数据已缓存，无 Sprint，2025 第2站）

## 注意事项

- fixture 文件已在 git 中，直接用，不要打网络重新拉
- Sprint 周末排除，只处理传统正赛
- 物理模型参考 docs/physics-model.md
- 环境：conda env f1apt，Python 3.10
