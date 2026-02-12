import "@src/index";

import {
  createPreactLeafletGeoKit,
  type PreactLeafletGeoKitProps,
} from "@src/preact/core";

export type { PreactLeafletGeoKitProps };

export const PreactLeafletGeoKit = createPreactLeafletGeoKit("bundled");

export default PreactLeafletGeoKit;
