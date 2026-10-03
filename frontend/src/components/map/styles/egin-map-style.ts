/**
 * Egin – Monochrome Google Maps JSON style.
 *
 * Design goals:
 *   • Eliminate visual noise (minor roads, POI, transit).
 *   • Keep major highways & water recognizable but desaturated.
 *   • Provide a clean, dark-neutral canvas so Egin data overlays pop.
 */
export const EGIN_GOOGLE_MAP_STYLE: google.maps.MapTypeStyle[] = [
  // ── Overall geometry ─────────────────────────────────
  {
    featureType: "all",
    elementType: "geometry",
    stylers: [{ saturation: -100 }, { lightness: -8 }],
  },
  {
    featureType: "all",
    elementType: "labels.text.fill",
    stylers: [{ color: "#8a8a8a" }],
  },
  {
    featureType: "all",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1a1a1a" }, { weight: 2 }],
  },

  // ── Water ────────────────────────────────────────────
  {
    featureType: "water",
    elementType: "geometry.fill",
    stylers: [{ color: "#1c1c24" }],
  },
  {
    featureType: "water",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },

  // ── Landscape / Land ─────────────────────────────────
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#242424" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry.fill",
    stylers: [{ color: "#2a2a2a" }],
  },

  // ── Roads ────────────────────────────────────────────
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#333333" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2a2a2a" }, { weight: 0.5 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.fill",
    stylers: [{ color: "#3d3d3d" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#2f2f2f" }, { weight: 0.8 }],
  },
  // Strip minor road labels
  {
    featureType: "road.local",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road.arterial",
    elementType: "labels",
    stylers: [{ visibility: "simplified" }],
  },

  // ── POI – fully hidden ──────────────────────────────
  {
    featureType: "poi",
    elementType: "all",
    stylers: [{ visibility: "off" }],
  },

  // ── Transit – fully hidden ──────────────────────────
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "off" }],
  },

  // ── Administrative ──────────────────────────────────
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#3a3a3a" }, { weight: 0.6 }],
  },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#999999" }],
  },
  {
    featureType: "administrative.neighborhood",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

export const EGIN_GOOGLE_MAP_DARK_STYLE: google.maps.MapTypeStyle[] = [
  {
    featureType: "all",
    elementType: "geometry",
    stylers: [{ saturation: -100 }, { lightness: -20 }],
  },
  {
    featureType: "all",
    elementType: "labels.text.fill",
    stylers: [{ color: "#749B7E" }],
  },
  {
    featureType: "all",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#001a11" }, { weight: 2 }],
  },
  {
    featureType: "water",
    elementType: "geometry.fill",
    stylers: [{ color: "#00140c" }],
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#002115" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry.fill",
    stylers: [{ color: "#002115" }],
  },
  {
    featureType: "road",
    elementType: "geometry.fill",
    stylers: [{ color: "#003322" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#001a11" }, { weight: 0.5 }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.fill",
    stylers: [{ color: "#00402a" }],
  },
  {
    featureType: "poi",
    elementType: "all",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit",
    elementType: "all",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#003d29" }, { weight: 0.6 }],
  },
];

/**
 * SVG data-URI for a minimal circular map marker.
 * Color: Egin accent green #4ADE80
 */
export const EGIN_MARKER_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <circle cx="14" cy="14" r="10" fill="#4ADE80" fill-opacity="0.25" stroke="#4ADE80" stroke-width="2"/>
  <circle cx="14" cy="14" r="4" fill="#4ADE80"/>
</svg>
`)}`;

/**
 * Google Maps init options for Egin – clean & minimal.
 */
export const EGIN_MAP_OPTIONS: Partial<google.maps.MapOptions> = {
  disableDefaultUI: true,
  clickableIcons: false,
  gestureHandling: "greedy",
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  zoomControl: false,
  styles: EGIN_GOOGLE_MAP_STYLE,
  backgroundColor: "#1a1a1a",
};
