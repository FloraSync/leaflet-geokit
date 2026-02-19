# Spec Kitty bootstrap

This repository includes a lightweight Spec Kitty bootstrap so teams can adopt spec-driven AI workflows incrementally.

## Intent

- Keep Spec Kitty **optional** for now.
- Avoid any coupling with build, test, or publish pipelines.
- Prepare repo conventions (`.kittify/*` artifacts committed, agent runtime folders ignored).

## How to start using it later

1. Install the CLI (see upstream docs): `spec-kitty`.
2. Initialize in-place from repo root:

   ```bash
   spec-kitty init . --ai claude
   ```

3. Commit only source-of-truth artifacts (templates/missions/memory), not runtime agent state.

## Non-blocking guarantee

No existing release or quality scripts depend on Spec Kitty. Current CI and publish flows remain unchanged.
