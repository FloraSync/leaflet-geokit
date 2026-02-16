# Publishing to npm (Quick Path)

This project is set up to publish a ready‑to‑use bundle and TypeScript types.

## 0) Prereqs

- An npm account with 2FA (recommended)
- Node 22 LTS or 24.x
- You own/control the target package name (e.g., `@florasync/leaflet-geokit`).

## 1) Update package.json fields

- `name`: the npm package name you want to publish under.
- `version`: bump semver as needed (start with 0.1.0 and iterate).
- `author`: your name or org.
- Optionally add:
  - `repository`: "github:user/repo"
  - `bugs`: { "url": "https://github.com/user/repo/issues" }
  - `homepage`: "https://github.com/user/repo#readme"

Tip: This project already includes `exports`, `types`, and `files` pointing at the `dist/` artifacts.

## 2) Verify build and contents

```bash
npm ci
npm run typecheck
npm run test:unit
npm run build
npm run pack:dry   # shows what will be published
```

You should see:

- `dist/leaflet-geokit.es.js`
- `dist/leaflet-geokit.umd.js`
- `dist/types/**/*.d.ts`
- `README.md`

## 3) Publish

```bash
npm login
npm publish --access public
```

For scoped packages (e.g., `@florasync/leaflet-geokit`), `--access public` is required the first time.

## Optional: Publish via GitHub Actions (main only)

- Add `NPM_TOKEN` as a GitHub Actions secret (an npm access token with publish rights for `@florasync`).
- Run the `Publish (npm)` workflow (`.github/workflows/npm-publish.yml`) on the `main` branch.
- The workflow bumps the **minor** version, publishes to npm, then pushes the version commit + tag back to `main`.

## 4) Verify install as a consumer

In a fresh project or codesandbox:

```ts
import "@florasync/leaflet-geokit";

// Then use the custom element in HTML
// <leaflet-geokit ...></leaflet-geokit>
```

## Notes

- The bundle intentionally includes Leaflet + Leaflet.draw to simplify usage.
- Types are emitted under `dist/types` and exposed via the `types` and `exports` entries.
- `prepack` runs `npm run build` automatically before `npm publish`.

---

## Automated Docker Image Publishing (Docker Hub)

The project includes automated Docker image publishing to Docker Hub via GitHub Actions. The workflow builds and publishes three Docker images whenever their corresponding Dockerfiles (or related scripts) are modified in the `main` branch.

### Images Published

1. **CI Image** (`{DOCKERHUB_REPO_PREFIX}-ci`)
   - Built from: `docker/Dockerfile.CI`
   - Purpose: Automated CI/CD testing environment
   - Triggers on changes to: `docker/Dockerfile.CI`, `scripts/ci-entry.sh`

2. **Devcontainer Image** (`{DOCKERHUB_REPO_PREFIX}-devcontainer`)
   - Built from: `docker/Dockerfile.devcontainer`
   - Purpose: VS Code development container
   - Triggers on changes to: `docker/Dockerfile.devcontainer`

3. **Publisher Image** (`{DOCKERHUB_REPO_PREFIX}-publisher`)
   - Built from: `docker/Dockerfile.publisher`
   - Purpose: Automated package publishing
   - Triggers on changes to: `docker/Dockerfile.publisher`, `scripts/publisher-entry.sh`

### Required GitHub Secrets

Configure these secrets in your repository settings (Settings → Secrets and variables → Actions):

- `DOCKERHUB_USERNAME`: Your Docker Hub username
- `DOCKERHUB_TOKEN`: Docker Hub Personal Access Token (PAT) with read/write permissions
  - Create at: https://hub.docker.com/settings/security
- `DOCKERHUB_REPO_PREFIX`: Base name for your Docker repositories (e.g., `florasync/leaflet-geokit`)

### Tagging Strategy

Each published image receives three tags:
- `latest` - Always points to the most recent build
- `{version}` - Semantic version from `package.json` (e.g., `0.4.0`)
- `{branch}-{sha}` - Git commit SHA for traceability (e.g., `main-abc1234`)

### Example Usage

After the workflow runs, pull images with:

```bash
# Latest CI image
docker pull florasync/leaflet-geokit-ci:latest

# Specific version
docker pull florasync/leaflet-geokit-ci:0.4.0

# Specific commit
docker pull florasync/leaflet-geokit-ci:main-abc1234
```

### Manual Trigger

You can manually trigger the workflow from GitHub:
1. Go to Actions → Docker Publish
2. Click "Run workflow"
3. Select the branch and run

### Workflow Behavior

- **Smart Builds**: Only builds images when their specific files change
- **Parallel Execution**: Multiple images can build simultaneously if multiple Dockerfiles change
- **Automatic Cancellation**: New pushes cancel in-progress builds
- **Build Caching**: Uses Docker registry cache for faster builds

---

## Optional: Publish via Docker sidecar

Build the publisher image once:

```bash
docker build -f docker/Dockerfile.publisher -t leaflet-geokit-publisher .
```

Run it with the repo mounted (interactive prompts included):

```bash
docker run -it --rm -v "$PWD":/app leaflet-geokit-publisher
```

This will:

- Prompt for git identity
- Offer to reset origin explicitly to HTTPS (e.g., https://github.com/owner/repo.git)
- GitHub auth options:
  - GitHub CLI (device/web flow): `gh auth login -p https`
  - Manual PAT entry (stored only inside the container)
- npm token configuration (recommended)
- Option to push to GitHub first (with an option to bypass Husky hooks for that push)
- Option to publish to npm after a successful push

---

## Dev Container vs Publisher Sidecar

These images are similar on purpose, but they serve different moments in your workflow:

- Dev Container: [docker/Dockerfile.devcontainer](docker/Dockerfile.devcontainer)
  - Goal: active development inside VS Code/Dev Containers.
  - Loads `.env` via [`.devcontainer/setup-from-env.sh`](.devcontainer/setup-from-env.sh) to configure git identity, HTTPS origin, GitHub PAT (optional), and npm token.
  - No automation: does not run tests/push/publish for you. Use normal commands (`git push`, `npm publish`) when you’re ready.

- Publisher Sidecar: [docker/Dockerfile.publisher](docker/Dockerfile.publisher)
  - Goal: release prep and publishing (interactive or env‑driven non‑interactive).
  - Loads `.env` and provides prompts with sane defaults; runs typecheck/tests/build/pack; can push first (optionally bypassing Husky) and then publish.
  - Best for consistent releases; non‑interactive toggles let you “set it and forget it”.
- Reads .env if present (see .env.example) and uses those as defaults in the prompts.

### Non-interactive toggles via .env

You can set the following to streamline runs:

- `PUBLISHER_SKIP_TESTS=1` — skip typecheck + unit tests inside the container
- `PUBLISH=1` — auto-confirm npm publish
- `PUSH=1` — auto-confirm git push
- `PUBLISHER_COMMIT_MSG="chore: release"` — commit message used if pushing
- `PUBLISHER_BYPASS_HUSKY=1` — bypasses Husky hooks on git push (sets HUSKY=0)
- `PUBLISHER_CONFIGURE_NPM=1` — auto-configure npm auth (uses `NPM_TOKEN`)
- `PUBLISHER_UPDATE_PKG=1` — auto-run the package.json name/author update step, prefilled from `PUBLISHER_PACKAGE_NAME` / `PUBLISHER_PACKAGE_AUTHOR`
- Optionally update package.json name/author
- Install deps, typecheck, run unit tests, build, and pack dry-run
- Optionally publish to npm and push to GitHub
