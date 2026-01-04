#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[devcontainer] Setting up from .env (if present)"

# Check for required packages on Debian
echo "[devcontainer] Checking for required packages on Debian"
for pkg in git curl; do
  if ! command -v $pkg >/dev/null 2>&1; then
    echo "[devcontainer] Installing $pkg (may require sudo)"
    sudo apt-get update && sudo apt-get install -y $pkg
  fi
done

# Load environment variables from .env
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
  
  # Handle git credentials file properly
  GIT_CRED_FILE="${HOME}/.git-credentials"
  
  # If it exists as a directory, remove it first
  if [[ -d "$GIT_CRED_FILE" ]]; then
    echo "[devcontainer] Removing ~/.git-credentials directory"
    rm -rf "$GIT_CRED_FILE"
  fi
  
  # Ensure parent directory exists but don't create the credentials file as a directory
  mkdir -p "$(dirname "$GIT_CRED_FILE")"
  
  # Write credentials to file
  echo "https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com" > "$GIT_CRED_FILE"
  chmod 600 "$GIT_CRED_FILE"  # Ensure secure permissions on Debian
  echo "[devcontainer] Stored GitHub credentials for HTTPS pushes"
fi

# npm token
if [[ -n "${NPM_TOKEN:-}" ]]; then
  npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN" >/dev/null 2>&1 || true
  echo "[devcontainer] npm auth token configured"
fi

# OpenAI / Codex CLI
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  # Update shell profiles
  echo "export OPENAI_API_KEY=$OPENAI_API_KEY" >> ~/.bashrc
  if [[ -f ~/.bash_profile ]]; then
    echo "export OPENAI_API_KEY=$OPENAI_API_KEY" >> ~/.bash_profile
  fi
  # Also add to .profile for broader compatibility
  if [[ -f ~/.profile ]]; then
    echo "export OPENAI_API_KEY=$OPENAI_API_KEY" >> ~/.profile
  fi
  echo "[devcontainer] OPENAI_API_KEY exported in shell profiles"
fi

# Gemini API key
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  # Update shell profiles
  echo "export GEMINI_API_KEY=$GEMINI_API_KEY" >> ~/.bashrc
  if [[ -f ~/.bash_profile ]]; then
    echo "export GEMINI_API_KEY=$GEMINI_API_KEY" >> ~/.bash_profile
  fi
  # Also add to .profile for broader compatibility
  if [[ -f ~/.profile ]]; then
    echo "export GEMINI_API_KEY=$GEMINI_API_KEY" >> ~/.profile
  fi
  echo "[devcontainer] GEMINI_API_KEY exported in shell profiles"
fi

if [[ "${DEVCONTAINER_INSTALL_CODEX:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
  echo "[devcontainer] Installing @openai/codex globally"
  npm install -g @openai/codex
fi

# Set proper permissions for the home directory in Debian
if [[ -d "$HOME" ]]; then
  # Ensure any created directories have proper ownership
  find "$HOME" -not -user $(whoami) -exec sudo chown $(whoami):$(id -gn) {} \; 2>/dev/null || true
fi

echo "[devcontainer] Setup complete"
