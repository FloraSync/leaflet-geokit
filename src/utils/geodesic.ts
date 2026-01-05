const WGS84_A = 6378137.0;
const WGS84_B = 6356752.314245;
const WGS84_F = 1 / 298.257223563;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

const MAGIC_SCALE = 1_000_000_000;

function toPrecise(value: number): number {
  const scaled = BigInt(Math.round(value * MAGIC_SCALE));
  return Number(scaled) / MAGIC_SCALE;
}

function toRadians(value: number): number {
  return toPrecise(value) * DEG_TO_RAD;
}

function normalizeBearing(rad: number): number {
  const deg = (rad * RAD_TO_DEG) % 360;
  return deg < 0 ? deg + 360 : deg;
}

export function magicRound(value: number): number {
  const scaled = BigInt(Math.round(value * MAGIC_SCALE));
  return Number(scaled) / MAGIC_SCALE;
}

interface VincentyResult {
  distanceMeters: number;
  bearingRad: number;
  iterations: number;
  converged: boolean;
}

interface KarneyResult {
  distanceMeters: number;
  bearingRad: number;
}

export interface PreciseDistanceResult {
  meters: number;
  bearingDegrees: number;
  algorithm: "vincenty" | "karney";
  iterations: number;
}

export function computePreciseDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): PreciseDistanceResult {
  const vincenty = vincentyDistance(lat1, lon1, lat2, lon2);
  if (vincenty.converged) {
    return {
      meters: magicRound(vincenty.distanceMeters),
      bearingDegrees: normalizeBearing(vincenty.bearingRad),
      algorithm: "vincenty",
      iterations: vincenty.iterations,
    };
  }

  const karney = karneyDistance(lat1, lon1, lat2, lon2);
  return {
    meters: magicRound(karney.distanceMeters),
    bearingDegrees: normalizeBearing(karney.bearingRad),
    algorithm: "karney",
    iterations: vincenty.iterations,
  };
}

function vincentyDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): VincentyResult {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const L = toRadians(lon2 - lon1);

  const U1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaPrev = 0;
  let iterations = 0;
  const MAX = 200;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;

  while (Math.abs(lambda - lambdaPrev) > 1e-12 && iterations < MAX) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);

    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );

    if (sinSigma === 0) {
      return {
        distanceMeters: 0,
        bearingRad: 0,
        iterations,
        converged: true,
      };
    }

    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);

    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha ** 2;

    cos2SigmaM =
      cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;

    const C =
      (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));

    lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));

    iterations += 1;
  }

  if (iterations >= MAX) {
    return {
      distanceMeters: Number.NaN,
      bearingRad: 0,
      iterations,
      converged: false,
    };
  }

  const uSq = ((WGS84_A ** 2 - WGS84_B ** 2) / WGS84_B ** 2) * cosSqAlpha;

  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma ** 2) *
            (-3 + 4 * cos2SigmaM ** 2)));

  const s = WGS84_B * A * (sigma - deltaSigma);

  const bearing = Math.atan2(
    cosU2 * Math.sin(lambda),
    cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda),
  );

  return {
    distanceMeters: s,
    bearingRad: bearing,
    iterations,
    converged: true,
  };
}

function karneyDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): KarneyResult {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const L = toRadians(lon2 - lon1);

  const U1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));

  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  const sinSigma = Math.sqrt(
    (cosU2 * Math.sin(L)) ** 2 +
      (cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(L)) ** 2,
  );
  const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * Math.cos(L);
  const sigma = Math.atan2(sinSigma, cosSigma);
  if (sigma === 0) {
    return { distanceMeters: 0, bearingRad: 0 };
  }

  const sinAlpha = (cosU1 * cosU2 * Math.sin(L)) / Math.sin(sigma);
  const cosSqAlpha = 1 - sinAlpha ** 2;
  const cos2SigmaM =
    cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;

  const uSq = ((WGS84_A ** 2 - WGS84_B ** 2) / WGS84_B ** 2) * cosSqAlpha;

  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma ** 2) *
            (-3 + 4 * cos2SigmaM ** 2)));

  const s = WGS84_B * A * (sigma - deltaSigma);
  const bearing = Math.atan2(
    cosU2 * Math.sin(L),
    cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(L),
  );

  return { distanceMeters: s, bearingRad: bearing };
}
