import maplibregl from "maplibre-gl";
import { apiUrl } from "@/lib/api";
import { CROP_COLOR_EXPRESSION } from "../styles/tile-sources";

/**
 * Fetch farm plots from API and render on the map.
 * Creates source + layers on first call, updates source data on subsequent calls.
 * Returns the parsed features array for use in pointer-hit-testing.
 */
export const fetchAndRenderPlots = async (
  map: maplibregl.Map,
  cultureLabel: string,
  onPlotClick?: (props: any) => void,
  supplied?: import("@/lib/types").Field[],
): Promise<any[]> => {
  let json: any;
  try {
    let rows=supplied;
    if(!rows){const response=await fetch(apiUrl('/fields'),{credentials:'same-origin'});if(!response.ok)return [];rows=await response.json();}
    json={data:rows!.map((f:any)=>({...f,title:f.name,cropType:f.crop_name,fillColor:'#70934f'}))};
  } catch { return []; }

  const features = json.data
    .map((plot: any) => {
      const geometry =
        typeof plot.geometry === "string"
          ? JSON.parse(plot.geometry)
          : plot.geometry;
      if (!geometry) return null;
      return {
        type: "Feature",
        properties: {
          id: plot.id,
          cropType: plot.cropType,
          title: plot.title,
          fillColor: plot.fillColor || null,
        },
        geometry,
      };
    })
    .filter(Boolean);

  // --- Update or create source + layers ---
  const source = map.getSource("farm-plots") as
    | maplibregl.GeoJSONSource
    | undefined;

  if (source) {
    source.setData({ type: "FeatureCollection", features });
    return features;
  }

  map.addSource("farm-plots", {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });

  map.addLayer({
    id: "farm-plots-layer",
    type: "fill",
    source: "farm-plots",
    paint: {
      "fill-color": CROP_COLOR_EXPRESSION,
      "fill-opacity": 0.4,
    },
  });

  map.addLayer({
    id: "farm-plots-outline",
    type: "line",
    source: "farm-plots",
    paint: {
      "line-color": "#244F2E",
      "line-width": 2.5,
      "line-opacity": 0.8,
    },
  });

  map.addLayer({
    id: "farm-plots-labels",
    type: "symbol",
    source: "farm-plots",
    layout: {
      "text-field": [
        "format",
        ["get", "title"],
        { "font-scale": 1.1 },
        "\n",
        ["get", "cropType"],
        { "font-scale": 0.8 },
      ],
      "text-size": 14,
      "text-anchor": "center",
      "text-justify": "center",
      "symbol-placement": "point",
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 2,
    },
  });

  // --- Click handlers ---
  const openPlotEditor = (
    props: any | null | undefined,
    lngLat?: maplibregl.LngLat,
  ) => {
    if (!props) return;
    if (onPlotClick) {
      onPlotClick(props);
    } else if (lngLat) {
      const container = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = props.title || "Без названия";
      container.appendChild(strong);
      container.appendChild(document.createElement("br"));
      container.appendChild(
        document.createTextNode(`${cultureLabel}: ${props.cropType || "Не указана"}`)
      );

      new maplibregl.Popup()
        .setLngLat(lngLat)
        .setDOMContent(container)
        .addTo(map);
    }
  };

  const clickableLayers = [
    "farm-plots-layer",
    "farm-plots-outline",
    "farm-plots-labels",
  ];

  clickableLayers.forEach((layerId) => {
    map.on("click", layerId, (e: any) => {
      openPlotEditor(e.features?.[0]?.properties, e.lngLat);
    });
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });
  });

  map.on("click", (e: any) => {
    const hits = map.queryRenderedFeatures(e.point, {
      layers: clickableLayers.filter((id) => map.getLayer(id)),
    });
    openPlotEditor(hits[0]?.properties, e.lngLat);
  });

  return features;
};

/** Layer IDs that respond to plot clicks */
export const CLICKABLE_PLOT_LAYERS = [
  "farm-plots-layer",
  "farm-plots-outline",
  "farm-plots-labels",
];
