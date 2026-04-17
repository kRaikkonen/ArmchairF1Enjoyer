---
name: pipeline-conventions
description: Use this skill whenever touching any file under pipeline/src/ or pipeline/tests/. Enforces three non-negotiable conventions that keep the data pipeline honest across all tracks.
---

# Pipeline Conventions

## 1. 所有拟合函数必须返回含 fitMeta 的 dataclass

每个 `fit_*` 函数的返回类型必须是带有 `fitMeta` 字段的 dataclass，不能是裸 dict 或 tuple。

`fitMeta` 最少包含：
- `nSamples: int` — 参与拟合的干净圈数
- `rSquared: float | None` — 拟合 R²（回归才有，分组统计填 None）
- `insufficientGroups: list[str]` — 样本不足的 (team, compound) 或其他分组

示例：
```python
@dataclass
class TyreDegResult:
    entries: dict[tuple[str, str], TyreDegEntry]
    fitMeta: TyreDegFitMeta   # 必须，不能省

@dataclass
class TyreDegFitMeta:
    nSamples: int
    rSquared: None          # 分组回归不汇总 R²
    insufficientGroups: list[str]
```

导出 JSON 时 `fitMeta` 原样写入 `models/tracks/<year>/<name>.json`，供前端页脚展示。

---

## 2. 样本不足时返回 None 并打 warning，禁止 fallback

阈值：分组样本 < 20 圈视为不足。

**正确做法**：
```python
if n_samples < MIN_SAMPLES:
    logger.warning(
        "Insufficient data for %s/%s: %d laps (need %d). Skipping.",
        team, compound, n_samples, MIN_SAMPLES
    )
    entries[(team, compound)] = None   # 显式 None，调用方自行处理
    continue
```

**禁止**：
```python
# ❌ 不能这样
deg_linear = default_deg if n_samples < 20 else fitted_deg
intercept = track_base_pace   # 用全局均值填坑
```

原因：静默 fallback 会让回测数字"看起来不错"，但是是假的。真正样本不足时，前端应显示"数据不足，结果仅供参考"，而不是用一个不可靠的估计值。

---

## 3. pytest 用 fixture 文件，禁止打网络

所有 pytest 测试必须使用 `pipeline/tests/fixtures/` 下的预置文件：
- `bahrain-2025-laps.parquet`
- `bahrain-2025-meta.json`

**禁止在测试中调用**：
- `fastf1.get_session(...)` 或任何 FastF1 network 调用
- `fetch_race(...)` 的实际网络路径（可以 mock）
- `requests.get`, `urllib`, `httpx` 等

```python
# ✅ 正确
@pytest.fixture
def bahrain_laps(fixture_dir):
    return pd.read_parquet(fixture_dir / "bahrain-2025-laps.parquet")

# ❌ 禁止
def test_something():
    session = fastf1.get_session(2025, "Bahrain", "R")  # 打网络，CI 会挂
    session.load()
```

新赛道 fixture 必须由人类手动生成（`scripts/fetch-fixture.py <track> <year>`）并 commit，Claude Code 不重新拉取。

---

## Pre-commit checklist

1. `grep -rn "get_session" pipeline/tests/` — 必须零命中（除 fetch.py 的 unit test 外）
2. 所有新 `fit_*` 函数返回值是 dataclass，`hasattr(result, 'fitMeta')` 为 True
3. 所有 `logger.warning("Insufficient")` 调用有对应的 `None` 返回，没有后续 fallback
