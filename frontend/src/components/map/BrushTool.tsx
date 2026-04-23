"use client";

import { useEffect, useRef, useCallback } from "react";
import * as turf from "@turf/turf";
import type { GeoJSONGeometry } from "./types";


interface BrushToolProps {
  map: google.maps.Map | null;
  isActive: boolean;
  snapGridEnabled: boolean;
  onGeometrySelected: (geom: GeoJSONGeometry | null) => void;
}

export default function BrushTool({ 
  map, 
  isActive, 
  snapGridEnabled, 
  onGeometrySelected 
}: BrushToolProps) {
  const brushPath = useRef<google.maps.MVCArray<google.maps.LatLng> | null>(null);
  
  // Initialize MVCArray safely
  const getBrushPath = () => {
    if (!brushPath.current) {
      brushPath.current = new google.maps.MVCArray<google.maps.LatLng>();
    }
    return brushPath.current;
  };

  const brushPolygon = useRef<google.maps.Polygon | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const strokeRef = useRef<google.maps.Polyline | null>(null);

  // Cleanup on unmount or deactivate
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (brushPolygon.current) {
        brushPolygon.current.setMap(null);
      }
      if (strokeRef.current) {
        strokeRef.current.setMap(null);
      }
    };
  }, []);

  const snapToGrid = useCallback((latLng: google.maps.LatLng): google.maps.LatLng => {
    if (!snapGridEnabled) return latLng;
    
    const zoom = map?.getZoom() || 15;
    const gridSize = Math.pow(2, 18 - zoom) * 0.00005; // Dynamic grid: 0.5m-50m
    
    const lat = Math.round(latLng.lat() / gridSize) * gridSize;
    const lng = Math.round(latLng.lng() / gridSize) * gridSize;
    
    return new google.maps.LatLng(lat, lng);
  }, [map, snapGridEnabled]);

  const createBrushPolygon = useCallback((center: google.maps.LatLng, size: number) => {
    const half = size / 2;
    return new google.maps.Polygon({
      paths: [
        new google.maps.LatLng(center.lat() + half, center.lng() - half),
        new google.maps.LatLng(center.lat() + half, center.lng() + half),
        new google.maps.LatLng(center.lat() - half, center.lng() + half),
        new google.maps.LatLng(center.lat() - half, center.lng() - half),
      ],
      fillColor: "#4ADE80",
      fillOpacity: 0.35,
      strokeColor: "#22C55E",
      strokeWeight: 2,
      strokeOpacity: 0.8,
      clickable: false,
    });
  }, []);

  const onBrushClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!map || !e.latLng || !isActive) return;

    const snapped = snapToGrid(e.latLng);
    const zoom = map.getZoom() || 15;
    const brushSize = 0.0003 * Math.pow(1.3, 18 - zoom); // Brush 25-80m diameter

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Update stroke path
    if (!brushPath.current) {
      brushPath.current = new google.maps.MVCArray();
      strokeRef.current = new google.maps.Polyline({
        path: brushPath.current,
        strokeColor: "#4ADE80",
        strokeWeight: 4,
        strokeOpacity: 0.7,
        map,
        geodesic: true,
      });
    }
    
    brushPath.current.push(snapped);

    // Show temporary brush stroke
    if (brushPolygon.current) {
      brushPolygon.current.setMap(null);
    }
    
    brushPolygon.current = createBrushPolygon(snapped, brushSize);
    brushPolygon.current.setMap(map);

    // Auto-complete polygon after 800ms inactivity
    timeoutRef.current = setTimeout(() => {
      if (brushPath.current && brushPath.current.getLength() > 2) {
        // Convert path to polygon (buffer stroke)
        const pathCoords = brushPath.current.getArray().map(p => [p.lng(), p.lat()]);
        const feature = {
          type: "Feature",
          geometry: { type: "LineString", coordinates: pathCoords },
          properties: {},
        } as any;

        // Use turf buffer to create field from stroke
        const buffered = turf.buffer(feature, brushSize * 111, { units: "kilometers" });
        if (buffered && buffered.geometry) {
          onGeometrySelected(buffered.geometry);
        }

        
        // Cleanup
        brushPath.current?.clear();
        if (strokeRef.current) strokeRef.current.setMap(null);
        if (brushPolygon.current) brushPolygon.current.setMap(null);
      }
    }, 800);
  }, [map, isActive, snapToGrid, createBrushPolygon, onGeometrySelected]);

  useEffect(() => {
    if (!map) return;

    map.setOptions({ 
      draggableCursor: isActive ? "crosshair" : null 
    });

    const listener = isActive 
      ? map.addListener("click", onBrushClick) 
      : null;

    return () => {
      if (listener) google.maps.event.removeListener(listener);
    };
  }, [map, isActive, onBrushClick]);

  return null;
};
