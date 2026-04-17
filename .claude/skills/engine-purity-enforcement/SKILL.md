---
name: engine-purity-enforcement
description: Use this skill when modifying any file under web/src/engine/. Enforces purity rules that keep the simulation engine portable and ensure deterministic shareable URLs.
---

# Engine Purity Rules

## Forbidden imports
- react, react-dom, react-*
- fs, path, os, child_process
- window, document, localStorage, sessionStorage
- Any network library (axios, fetch wrappers)

## Forbidden APIs
- Math.random() — use createRng(seed) from rng.ts
- Date.now(), performance.now(), new Date()
- Any global mutable state

## Required patterns
- Every physics coefficient must come from TrackModel, not a literal number
- If a literal number appears, it needs a comment explaining why it is not a fitted parameter
- Every simulation function signature: (input, trackModel, rng) => output

## Pre-commit checklist
1. grep -n "Math.random" web/src/engine/ — must be zero hits
2. Every number literal in lapTime.ts has a justification comment
3. Imports are only: other engine files, seedrandom, type-only imports
