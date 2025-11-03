# Publishing to npm (Quick Path)

This project is set up to publish a ready‑to‑use bundle and TypeScript types.

## 0) Prereqs

- An npm account with 2FA (recommended)
- Node 22 LTS or 24.x
- You own/control the target package name (e.g., `leaflet-draw-web-component` or a scoped name like `@yourname/leaflet-draw-web-component`).

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

- `dist/leaflet-draw-web-component.es.js`
- `dist/leaflet-draw-web-component.umd.js`
- `dist/types/**/*.d.ts`
- `README.md`

## 3) Publish

```bash
npm login
npm publish --access public
```

For scoped packages (e.g., `@yourname/pkg`), `--access public` is required the first time.

## 4) Verify install as a consumer

In a fresh project or codesandbox:

```ts
import "leaflet-draw-web-component";

// or with a scoped name
// import '@yourname/leaflet-draw-web-component';

// Then use the custom element in HTML
// <leaflet-draw-map ...></leaflet-draw-map>
```

## Notes

- The bundle intentionally includes Leaflet + Leaflet.draw to simplify usage.
- Types are emitted under `dist/types` and exposed via the `types` and `exports` entries.
- `prepack` runs `npm run build` automatically before `npm publish`.

---

## Optional: Publish via Docker sidecar

Build the publisher image once:

```bash
docker build -f docker/Dockerfile.publisher -t ldwc-publisher .
```

Run it with the repo mounted (interactive prompts included):

```bash
docker run -it --rm -v "$PWD":/app ldwc-publisher
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
