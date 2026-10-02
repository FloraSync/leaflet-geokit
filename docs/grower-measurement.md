# Grower-scale measurement accuracy

The existing ruler uses `computePreciseDistance` in `src/utils/geodesic.ts`.
Its Vincenty iteration must execute at least once even when longitude difference
is zero. Otherwise a north/south bed or irrigation row is reported as zero length.
The initial previous-longitude sentinel now guarantees that first evaluation;
the public API and units remain unchanged.

Regression coverage in `tests/geodesic.spec.ts` checks a same-meridian row in both
directions (about 11.0574276 m for 0.0001 degrees latitude at the equator), a nearly
meridional grower-scale segment, identical points, and the existing long-distance
cases.

Verified commands for this prerequisite:

- `npm run test:unit:focused -- tests/geodesic.spec.ts` — 15 tests passed.
- `npm run typecheck` — passed.

This is a prerequisite repair for FLOA-510, not delivery of snapping, geometry
operations, grower presets, or area/perimeter overlays. Those features require
separate implementation and desktop/touch interaction verification. Existing
irrigation geometry in `src/lib/layer-cake/CakeBaker.ts` and the layer-cake session
APIs should be reused rather than replaced.
