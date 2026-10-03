import type { PlatformLanguage } from "@/lib/i18n";

/**
 * MapLibre raster style using Google Maps standard tiles.
 */
export const GOOGLE_MAP_STYLE = (lang: PlatformLanguage) =>
  ({
    version: 8,
    sources: {
      "google-standard": {
        type: "raster",
        tiles: [
          `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=${lang}`,
        ],
        tileSize: 256,
        attribution: "© Google",
      },
    },
    layers: [
      {
        id: "google-standard-layer",
        type: "raster",
        source: "google-standard",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  }) as any;

/**
 * Google satellite tile source config (added at runtime on map load).
 */
export const SATELLITE_SOURCE = {
  type: "raster" as const,
  tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
  tileSize: 256,
  attribution: "© Google",
};

/**
 * Crop-type → fill-color mapping for farm plot fill layer.
 */
export const CROP_COLOR_EXPRESSION = [
  "coalesce",
  ["get", "fillColor"],
  [
    "match",
    ["get", "cropType"],
    "Арбуз",        "#2F6B3D",
    "Қарбыз",       "#2F6B3D",
    "Watermelon",   "#2F6B3D",
    "Картофель",    "#C6A85E",
    "Картоп",       "#C6A85E",
    "Potato",       "#C6A85E",
    "Пшеница",      "#A7B84B",
    "Бидай",        "#A7B84B",
    "Wheat",        "#A7B84B",
    "Кукуруза",     "#D4A017",
    "Corn",         "#D4A017",
    "Помидоры",     "#C0392B",
    "Tomato",       "#C0392B",
    "Лук",          "#8E44AD",
    "Onion",        "#8E44AD",
    "Морковь",      "#E67E22",
    "Carrot",       "#E67E22",
    "Подсолнечник", "#F1C40F",
    "Sunflower",    "#F1C40F",
    "Рис",          "#1ABC9C",
    "Rice",         "#1ABC9C",
    "Ячмень",       "#27AE60",
    "Barley",       "#27AE60",
    "Хлопок",       "#BDC3C7",
    "Cotton",       "#BDC3C7",
    "Свёкла",       "#9B59B6",
    "Beet",         "#9B59B6",
    "#888",
  ],
] as any;
