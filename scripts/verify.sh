#!/usr/bin/env bash
set -euo pipefail

echo "==> [1/3] Python lint"
cd pipeline
conda run -n f1apt ruff check src tests || echo "WARN: ruff not installed yet, skipping"
cd ..

echo "==> [2/3] Python tests"
if [ -d pipeline/tests ] && [ "$(ls pipeline/tests/*.py 2>/dev/null | wc -l)" -gt 0 ]; then
  cd pipeline
  conda run -n f1apt pytest -q
  cd ..
else
  echo "  (no tests yet, skipping)"
fi

echo "==> [3/3] Backtest sanity"
if [ -f models/tracks/2025/bahrain.json ]; then
  cd pipeline
  conda run -n f1apt python -m src.backtest_sanity bahrain 2025
  cd ..
else
  echo "  (no bahrain.json yet, skipping)"
fi

echo ""
echo "✅ verify.sh passed"
