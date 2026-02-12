const CANONICAL_TAG_NAME = "leaflet-geokit";

let registrationPromise: Promise<void> | null = null;

export function isLeafletGeoKitRegistered(): boolean {
  if (typeof customElements === "undefined") return false;
  return Boolean(customElements.get(CANONICAL_TAG_NAME));
}

export async function ensureLeafletGeoKitRegistered(): Promise<void> {
  if (typeof customElements === "undefined") return;
  if (isLeafletGeoKitRegistered()) return;

  if (!registrationPromise) {
    registrationPromise = import("@src/index")
      .then(() => undefined)
      .finally(() => {
        registrationPromise = null;
      });
  }

  await registrationPromise;
}
