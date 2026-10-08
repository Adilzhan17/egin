import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { PlatformLanguage } from "@/lib/i18n";
import type { AutoToolType } from "@/lib/turf-tools";

export interface GeoJSONGeometry {
  type: string;
  coordinates: any;
}

export type BaseMapMode = "simple" | "satellite";

export interface MapProps {
  plots?: import("@/lib/types").Field[];
  compact?: boolean;
  onReady?: () => void;
  onGeometrySelected?: (geom: GeoJSONGeometry | null) => void;
  drawModeActive?: boolean;
  rulerModeActive?: boolean;
  language: PlatformLanguage;
  showMeasurements: boolean;
  onPlotClick?: (plot: PlotProperties & { geometry?: string | GeoJSONGeometry }) => void;
  onModeChange?: (mode: string) => void;
  onMeasurement?: (val: string | null) => void;
  massWandActive?: boolean;
  onProcessingStateChange?: (processing: boolean) => void;
  onNotification?: (msg: string, type: "error" | "success" | "warning") => void;
  drawMode?: string;
  currentUserRole?: string;
  isProcessingWand?: boolean;
  measurement?: string | null;
  onSavePlot?: () => void;
  onOpenGuide?: () => void;
}

export interface MapRef {
  getMap: () => import("maplibre-gl").Map | null;
  getDraw: () => MapboxDraw | null;
  refreshPlots: () => void;
  focusCurrentLocation: () => void;
  flyToRegion: (center: [number, number], zoom: number) => void;
  changeDrawMode: (mode: string) => void;
  deleteSelectedDraw: () => void;
  getSelectedGeometry: () => GeoJSONGeometry | null;
  executeAutoTool: (tool: AutoToolType) => void;
}

/** Plot feature properties as they come from the API */
export interface PlotProperties {
  id: string;
  cropType: string;
  title: string;
  fillColor: string | null;
}
