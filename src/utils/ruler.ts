export type MeasurementSystem = "metric" | "imperial";

export interface RulerLengthUnitOptions {
  display: string;
  decimal: number;
  factor: number | null;
  label: string;
}

export interface RulerAngleUnitOptions {
  display: string;
  decimal: number;
  factor: number | null;
  label: string;
}

export interface RulerOptions {
  position: string;
  circleMarker: {
    color: string;
    radius: number;
  };
  lineStyle: {
    color: string;
    dashArray: string;
  };
  lengthUnit: RulerLengthUnitOptions;
  angleUnit: RulerAngleUnitOptions;
}

const BASE_OPTIONS: Omit<RulerOptions, "lengthUnit"> = {
  position: "topleft",
  circleMarker: {
    color: "red",
    radius: 2,
  },
  lineStyle: {
    color: "red",
    dashArray: "1,6",
  },
  angleUnit: {
    display: "°",
    decimal: 2,
    factor: null,
    label: "Bearing:",
  },
};

const METRIC_LENGTH: RulerLengthUnitOptions = {
  display: "km",
  decimal: 2,
  factor: null,
  label: "Distance (km):",
};

const IMPERIAL_LENGTH: RulerLengthUnitOptions = {
  display: "mi",
  decimal: 2,
  factor: 0.621371,
  label: "Distance (mi):",
};

/**
 * Build Leaflet-ruler options for a given measurement system.
 */
export function getRulerOptions(system: MeasurementSystem): RulerOptions {
  const lengthUnit =
    system === "imperial" ? { ...IMPERIAL_LENGTH } : { ...METRIC_LENGTH };

  return {
    ...BASE_OPTIONS,
    lengthUnit,
  };
}

export const measurementSystemDescriptions: Record<MeasurementSystem, string> =
  {
    metric: "Meters / Kilometers",
    imperial: "Feet / Miles",
  };
