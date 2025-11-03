#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[devcontainer] Setting up from .env (if present)"

if [[ -f .env ]]; then
  set -a
  . ./.env
  set +a
else
  echo "[devcontainer] No .env found; using interactive defaults if needed"
fi

# Git identity
if [[ -n "${PUBLISHER_GIT_NAME:-}" ]]; then
  git config --global user.name "$PUBLISHER_GIT_NAME"
fi
if [[ -n "${PUBLISHER_GIT_EMAIL:-}" ]]; then
  git config --global user.email "$PUBLISHER_GIT_EMAIL"
fi

# Origin HTTPS (explicit reset only if provided)
if [[ -n "${PUBLISHER_ORIGIN_HTTPS:-}" ]]; then
  git remote set-url origin "$PUBLISHER_ORIGIN_HTTPS" 2>/dev/null || git remote add origin "$PUBLISHER_ORIGIN_HTTPS" || true
  echo "[devcontainer] origin => $PUBLISHER_ORIGIN_HTTPS"
fi

# GitHub credentials (PAT based) if provided
if [[ -n "${GITHUB_USERNAME:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
  git config --global credential.helper store
  mkdir -p ~/.git-credentials
  echo "https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com" > ~/.git-credentials
  echo "[devcontainer] Stored GitHub credentials for HTTPS pushes"
fi

# npm token
if [[ -n "${NPM_TOKEN:-}" ]]; then
  npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN" >/dev/null 2>&1 || true
  echo "[devcontainer] npm auth token configured"
fi

# OpenAI / Codex CLI
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  echo "export OPENAI_API_KEY=$OPENAI_API_KEY" >> ~/.bashrc
  echo "[devcontainer] OPENAI_API_KEY exported in ~/.bashrc"
fi

if [[ "${DEVCONTAINER_INSTALL_CODEX:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[devcontainer] Installing @openai/codex globally"
  npm install -g @openai/codex
fi

echo "[devcontainer] Setup complete"
