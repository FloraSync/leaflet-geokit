import "@src/index";

import {
  createReactLeafletGeoKit,
  type ReactLeafletGeoKitProps,
} from "@src/react/core";

export type { ReactLeafletGeoKitProps };

export const ReactLeafletGeoKit = createReactLeafletGeoKit("bundled");

export default ReactLeafletGeoKit;
