import type * as LType from "leaflet";

export interface AssertDrawOptions {
  onError?: (message: string) => void;
}

/**
 * Validate that Leaflet.draw APIs exist on the provided Leaflet namespace.
 * Returns true when present, false otherwise.
 */
export function assertDrawPresent(
  L: typeof LType,
  opts: AssertDrawOptions = {},
): boolean {
  const hasControlDraw = Boolean((L?.Control as any)?.Draw);
  const hasDrawNamespace = Boolean((L as any).draw);
  const ok = hasControlDraw && hasDrawNamespace;
  if (!ok) {
    opts.onError?.(
      "Leaflet.draw is not available on the provided Leaflet instance",
    );
  }
  return ok;
}
