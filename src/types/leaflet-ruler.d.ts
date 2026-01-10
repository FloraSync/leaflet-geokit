import "leaflet";

declare module "leaflet" {
  namespace Control {
    class Ruler extends Control {
      constructor(_options?: any);
    }
  }

  namespace control {
    function ruler(_options?: any): Control.Ruler;
  }
}
