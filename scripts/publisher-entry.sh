#!/usr/bin/env bash
set -euo pipefail

banner() {
  printf "\n\033[1m%s\033[0m\n" "$1"
}

prompt() {
  local var="$1"; shift
  local msg="$1"; shift || true
  local def="${1:-}"; shift || true
  local input
  if [[ -n "$def" ]]; then
    read -r -p "$msg [$def]: " input || true
    input=${input:-$def}
  else
    read -r -p "$msg: " input || true
  fi
  printf -v "$var" '%s' "$input"
}

prompt_secret() {
  local var="$1"; shift
  local msg="$1"; shift
  local input
  read -r -s -p "$msg: " input || true
  echo
  printf -v "$var" '%s' "$input"
}

main() {
  banner "Leaflet Draw Web Component • Publisher"
  echo "This container will help you prep, dry-run, and optionally publish to npm, and push to GitHub."

  if [[ ! -f package.json ]]; then
    echo "Error: package.json not found. Mount the repo into /app, e.g.:"
    echo "  docker run -it --rm -v \"$PWD\":/app ldwc-publisher"
    exit 1
  fi

  # Git identity
  local git_name git_email
  prompt git_name "Git user.name" "${PUBLISHER_GIT_NAME:-$(git config --get user.name || true)}"
  prompt git_email "Git user.email" "${PUBLISHER_GIT_EMAIL:-$(git config --get user.email || true)}"
  if [[ -n "$git_name" ]]; then git config --global user.name "$git_name"; fi
  if [[ -n "$git_email" ]]; then git config --global user.email "$git_email"; fi

  # Repo URL / branch (explicit HTTPS reset option)
  local origin_url branch owner repo https_guess
  origin_url="$(git remote get-url origin 2>/dev/null || true)"
  echo "Detected origin: ${origin_url:-<none>}"
  # Extract owner/repo from SSH or HTTPS
  if [[ "$origin_url" =~ ^git@github\.com:([^/]+)/([^\.]+)(\.git)?$ ]]; then
    owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
  elif [[ "$origin_url" =~ ^https?://github\.com/([^/]+)/([^\.]+)(\.git)?$ ]]; then
    owner="${BASH_REMATCH[1]}"; repo="${BASH_REMATCH[2]}"
  else
    owner=""; repo=""
  fi
  if [[ -n "$owner" && -n "$repo" ]]; then
    https_guess="https://github.com/${owner}/${repo}.git"
    read -r -p "Reset origin to HTTPS (${https_guess})? [y/N]: " reset_ans || true
    if [[ "${reset_ans,,}" == "y" ]]; then
      git remote set-url origin "$https_guess" 2>/dev/null || git remote add origin "$https_guess"
      origin_url="$https_guess"
      echo "Origin set to $https_guess"
    fi
  fi
  prompt origin_url "GitHub repo (HTTPS)" "${PUBLISHER_ORIGIN_HTTPS:-${origin_url:-https://github.com/owner/repo.git}}"
  prompt branch "Branch to push" "${PUBLISHER_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
  if [[ -n "$origin_url" ]]; then git remote set-url origin "$origin_url" 2>/dev/null || git remote add origin "$origin_url"; fi

  # GitHub credentials (optional)
  echo
  read -r -p "Configure GitHub HTTPS auth now? (g=gh-cli / p=PAT / n=skip) [g/p/N]: " gh_ans || true
  if [[ -z "$gh_ans" && -n "${PUBLISHER_GH_AUTH:-}" ]]; then gh_ans="$PUBLISHER_GH_AUTH"; fi
  case "${gh_ans,,}" in
    g)
      echo "Starting GitHub CLI auth (device or web flow)."
      # Prefer device flow in headless environments
      gh auth login -h github.com -p https || true
      # Ensure git uses stored credentials in container
      git config --global credential.helper store || true
      ;;
    p)
      local gh_user gh_pat
      if [[ -n "${GITHUB_USERNAME:-}" && -n "${GITHUB_TOKEN:-}" ]]; then
        echo "Using GitHub credentials from env (.env)"
        gh_user="$GITHUB_USERNAME"; gh_pat="$GITHUB_TOKEN"
      else
        prompt gh_user "GitHub username"
        prompt_secret gh_pat "GitHub Personal Access Token (scope: repo)"
      fi
      git config --global credential.helper store
      mkdir -p /root
      echo "https://${gh_user}:${gh_pat}@github.com" > /root/.git-credentials
      echo "Saved credentials to /root/.git-credentials (container only)."
      ;;
    *) ;;
  esac

  # NPM token
  echo
  if [[ -n "${NPM_TOKEN:-}" || "${PUBLISHER_CONFIGURE_NPM:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
    npm_ans=y
    echo "npm token configuration enabled (env)"
  else
    read -r -p "Configure npm auth token now for publish? [y/N]: " npm_ans || true
  fi
  if [[ "${npm_ans,,}" == "y" ]]; then
    local npm_token
    if [[ -n "${NPM_TOKEN:-}" ]]; then
      echo "Using npm token from env (.env)"
      npm_token="$NPM_TOKEN"
    else
      prompt_secret npm_token "Enter npm token (https://www.npmjs.com/settings/<you>/tokens)"
    fi
    npm config set //registry.npmjs.org/:_authToken "$npm_token" >/dev/null 2>&1 || true
    echo "npm token configured for this container session."
  fi

  # Optional package.json updates
  echo
  if [[ "${PUBLISHER_UPDATE_PKG:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
    pj_ans=y
    echo "package.json update enabled (env)"
  else
    read -r -p "Update package.json name/author now? [y/N]: " pj_ans || true
  fi
  if [[ "${pj_ans,,}" == "y" ]]; then
    local pkg_name author
    pkg_name=${PUBLISHER_PACKAGE_NAME:-$(node -p "require('./package.json').name")}
    author=${PUBLISHER_PACKAGE_AUTHOR:-$(node -p "require('./package.json').author || ''")}
    prompt pkg_name "package.json name" "$pkg_name"
    prompt author "package.json author" "$author"
    # Update via jq
    tmp=$(mktemp)
    jq --arg name "$pkg_name" --arg author "$author" '.name=$name | .author=$author' package.json > "$tmp" && mv "$tmp" package.json
    echo "package.json updated."
  fi

  banner "Install deps + typecheck + unit tests"
  npm ci
  if [[ "${PUBLISHER_SKIP_TESTS:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
    echo "Skipping typecheck and unit tests due to PUBLISHER_SKIP_TESTS"
  else
    npm run typecheck
    npm run test:unit
  fi

  banner "Build library"
  npm run build

  banner "Pack dry-run"
  npm pack --dry-run

  # --- Push to GitHub (first) ---
  echo
  if [[ "${PUSH:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
    push_ans=y
    echo "Auto-push enabled via PUSH env"
  else
    read -r -p "Push to GitHub now? [y/N]: " push_ans || true
  fi
  if [[ "${push_ans,,}" == "y" ]]; then
    git add -A || true
    if [[ -n "${PUBLISHER_COMMIT_MSG:-}" ]]; then
      msg="$PUBLISHER_COMMIT_MSG"
      echo "Using commit message from env"
    else
      read -r -p "Commit message (leave empty to skip commit): " msg || true
    fi
    if [[ -n "$msg" ]]; then git commit -m "$msg" || true; fi
    git branch -M "$branch" || true
    # Ask if we should bypass husky hooks for this push
    if [[ -n "${PUBLISHER_BYPASS_HUSKY:-}" ]]; then
      bypass="$PUBLISHER_BYPASS_HUSKY"
    else
      read -r -p "Bypass husky hooks for this push? [y/N]: " bypass || true
    fi
    if [[ "${bypass,,}" == "y" || "${bypass,,}" == "yes" || "${bypass,,}" == "true" || "${bypass}" == "1" ]]; then
      echo "Pushing with HUSKY=0 (hooks bypassed)"
      HUSKY=0 git push -u origin "$branch"
    else
      git push -u origin "$branch"
    fi
  fi

  # --- Publish to npm (second) ---
  echo
  if [[ "${PUBLISH:-}" =~ ^(1|y|Y|true|TRUE)$ ]]; then
    pub_ans=y
    echo "Auto-publish enabled via PUBLISH env"
  else
    read -r -p "Publish to npm now? [y/N]: " pub_ans || true
  fi
  if [[ "${pub_ans,,}" == "y" ]]; then
    # Detect if scoped package
    pkg=$(node -p "require('./package.json').name")
    if [[ "$pkg" == @*/* ]]; then
      npm publish --access public
    else
      npm publish
    fi
  fi

  banner "Done"
  echo "This container will exit now. Your repo changes remain on your host volume."
}

main "$@"
