# Phase 0: Bahrain 2025 闭环

## 出口条件

- [ ] bash scripts/verify.sh 全绿
- [ ] models/tracks/2025/bahrain.json 存在且含完整 fitMeta
- [ ] docs/backtest-log.md 有一条 Bahrain 2025 记录
- [ ] 样本不足的 (team, compound) 组合在日志中明确列出

## 验收标准

- top5 名次误差 <= 2 位
- 全场名次误差 <= 4 位
- top3 完赛时间误差 <= 5 秒

## 步骤

- [ ] 0.1 pipeline/pyproject.toml 建好，依赖写齐
- [ ] 0.2 pipeline/src/fetch.py：fetch_race(year, event) -> Session + pytest
- [ ] 0.3 pipeline/src/clean.py：clean_laps(session) -> DataFrame + pytest，用 fixture
- [ ] 0.4 fixture 就位，由人类手动生成，Claude Code 不要重新生成
        pipeline/tests/fixtures/bahrain-2025-laps.parquet
        pipeline/tests/fixtures/bahrain-2025-meta.json
- [ ] 0.5 pipeline/src/fit.py，以下函数各带一个 pytest
  - [ ] fit_stint_progress(laps) -> StintProgressModel
  - [ ] fit_tyre_deg(laps) -> dict
  - [ ] fit_dirty_air(laps) -> DirtyAirModel
  - [ ] fit_drs_boost(laps) -> DrsBoostModel
  - [ ] fit_driver_offsets(laps) -> dict
- [ ] 0.6 pipeline/src/backtest.py：backtest(model, session) -> BacktestReport
- [ ] 0.7 pipeline/src/export.py：export_track(model, path) 输出 schema-v1 JSON
- [ ] 0.8 pipeline/scripts/build_track.py：串起全流程，回测不过 exit 1
- [ ] 0.9 跑完整流程，产出 models/tracks/2025/bahrain.json
- [ ] 0.10 更新 backtest-log.md，停下来向人类汇报，不要自行开始 Phase 1

## 汇报模板

- 回测 top5 误差：___
- 回测全场误差：___
- 回测 top3 时间误差：___ 秒
- 样本不足组合：___
- 发现的数据异常：___
- 对模型局限的认识：___
- 建议下一条拟合的赛道：___

## 注意事项

- fixture 文件已在 git 中，直接用，不要打网络重新拉
- Sprint 周末排除，只处理传统正赛
- 物理模型参考 docs/physics-model.md
- 环境：conda env f1apt，Python 3.10