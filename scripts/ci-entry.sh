#!/usr/bin/env bash
set -euo pipefail

echo "[CI] Node: $(node -v)"
echo "[CI] NPM : $(npm -v)"

if [[ ! -f package.json ]]; then
  echo "[CI] error: package.json not found. Mount repo to /app"
  exit 1
fi

if [[ "${CI_SKIP_INSTALL:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[CI] Skipping npm ci"
else
  echo "[CI] npm ci"
  npm ci
fi

if [[ ! "${CI_SKIP_TYPECHECK:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[CI] typecheck"
  npm run typecheck
else
  echo "[CI] Skipping typecheck"
fi

if [[ ! "${CI_SKIP_PRETTIER:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[CI] prettier:check"
  npm run prettier:check
else
  echo "[CI] Skipping prettier:check"
fi

if [[ ! "${CI_SKIP_LINT:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[CI] lint"
  npm run lint
else
  echo "[CI] Skipping lint"
fi

if [[ ! "${CI_SKIP_UNIT:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[CI] unit tests"
  npm run test:unit
else
  echo "[CI] Skipping unit tests"
fi

if [[ "${CI_RUN_E2E:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[CI] Installing Playwright browsers"
  npm run e2e:install || true
  echo "[CI] Running e2e tests"
  if npm run test:e2e; then
    echo "[CI] e2e passed"
  else
    if [[ "${CI_ALLOW_E2E_FAIL:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
      echo "[CI] e2e failed but allowed to fail; continuing"
    else
      echo "[CI] e2e failed"
      exit 1
    fi
  fi
fi

echo "[CI] done"
