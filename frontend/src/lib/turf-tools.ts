import * as turf from "@turf/turf";

export type AutoToolType =
  | "buffer_50m"
  | "union"
  | "intersect"
  | "difference"
  | "cleanCoords"
  | "simplify"
  | "bezierSpline"
  | "centroid"
  | "centerOfMass"
  | "bboxPolygon"
  | "convex"
  | "lineToPolygon"
  | "polygonToLine"
  | "squareGrid_1ha"
  | "hexGrid_1ha"
  | "triangleGrid"
  | "voronoi"
  | "tesselate"
  | "scale_up"
  | "scale_down"
  | "rotate_90"
  | "copy_offset";

/**
 * Applies a Turf.js geoprocessing operation to an array of selected GeoJSON features.
 * Returns an array of newly generated features.
 */
export const applyAutoTool = (
  tool: AutoToolType,
  features: any[],
  options?: any
): any[] | null => {
  if (!features || features.length === 0) return null;

  try {
    const results: any[] = [];

    switch (tool) {
      case "buffer_50m":
        features.forEach((f) => {
          const buf = turf.buffer(f, 0.05, { units: "kilometers" });
          if (buf) results.push(buf);
        });
        break;

      case "union":
        if (features.length < 2) throw new Error("Выберите как минимум 2 полигона для объединения");
        let unionGeom = features[0];
        for (let i = 1; i < features.length; i++) {
          unionGeom = turf.union(turf.featureCollection([unionGeom, features[i]]));
        }
        if (unionGeom) results.push(unionGeom);
        break;

      case "intersect":
        if (features.length < 2) throw new Error("Выберите 2 полигона для пересечения");
        const intersected = turf.intersect(turf.featureCollection([features[0], features[1]]));
        if (intersected) results.push(intersected);
        break;

      case "difference":
        if (features.length < 2) throw new Error("Выберите 2 полигона для вычитания (цель, затем вычитаемый)");
        const diff = turf.difference(turf.featureCollection([features[0], features[1]]));
        if (diff) results.push(diff);
        break;

      case "cleanCoords":
        features.forEach((f) => results.push(turf.cleanCoords(f)));
        break;

      case "simplify":
        features.forEach((f) => results.push(turf.simplify(f, { tolerance: 0.005, highQuality: true })));
        break;

      case "bezierSpline":
        features.forEach((f) => {
          if (f.geometry && f.geometry.type === "LineString") {
            results.push(turf.bezierSpline(f));
          } else {
            throw new Error("Сглаживание работает только для линий");
          }
        });
        break;

      case "centroid":
        features.forEach((f) => results.push(turf.centroid(f)));
        break;

      case "centerOfMass":
        features.forEach((f) => {
          if (f.geometry && f.geometry.type === "Polygon") results.push(turf.centerOfMass(f));
          else results.push(turf.centroid(f));
        });
        break;

      case "bboxPolygon":
        const bbox = turf.bbox(turf.featureCollection(features));
        results.push(turf.bboxPolygon(bbox));
        break;

      case "convex":
        const convexHull = turf.convex(turf.featureCollection(features));
        if (convexHull) results.push(convexHull);
        break;

      case "lineToPolygon":
        features.forEach((f) => {
          if (f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")) {
            results.push(turf.lineToPolygon(f));
          }
        });
        break;

      case "polygonToLine":
        features.forEach((f) => {
          if (f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")) {
            results.push(turf.polygonToLine(f));
          }
        });
        break;

      case "squareGrid_1ha":
      case "hexGrid_1ha":
      case "triangleGrid":
        const gridBbox = turf.bbox(turf.featureCollection(features));
        const cellSide = 0.1; // 100 meters (1 hectare area)
        let grid;
        if (tool === "squareGrid_1ha") grid = turf.squareGrid(gridBbox, cellSide, { units: "kilometers" });
        else if (tool === "hexGrid_1ha") grid = turf.hexGrid(gridBbox, cellSide, { units: "kilometers" });
        else grid = turf.triangleGrid(gridBbox, cellSide, { units: "kilometers" });

        // Intersect grid with original shape (so it only fills the polygon)
        if (features.length === 1 && features[0].geometry && features[0].geometry.type === "Polygon") {
          grid.features.forEach((cell: any) => {
            const intersection = turf.intersect(turf.featureCollection([cell, features[0]]));
            if (intersection) results.push(intersection);
          });
        } else {
          results.push(...grid.features);
        }
        break;

      case "voronoi":
        const pointsArr: any[] = [];
        features.forEach(f => {
            if (f.geometry && f.geometry.type === "Point") pointsArr.push(f);
            else if (f.geometry && f.geometry.type === "Polygon") {
                const exploded = turf.explode(f);
                pointsArr.push(...exploded.features);
            }
        });
        if (pointsArr.length < 3) throw new Error("Нужно как минимум 3 точки для диаграммы Вороного");
        const vBbox = turf.bbox(turf.featureCollection(pointsArr));
        const voronoiPolygons = turf.voronoi(turf.featureCollection(pointsArr), { bbox: vBbox });
        results.push(...voronoiPolygons.features.filter(Boolean));
        break;

      case "tesselate":
        features.forEach(f => {
            if (f.geometry && f.geometry.type === "Polygon") {
                const tess = turf.tesselate(f);
                results.push(...tess.features);
            } else {
                throw new Error("Триангуляция работает только для полигонов");
            }
        });
        break;

      case "scale_up":
        features.forEach(f => results.push(turf.transformScale(f, 1.1)));
        break;

      case "scale_down":
        features.forEach(f => results.push(turf.transformScale(f, 0.9)));
        break;

      case "rotate_90":
        features.forEach(f => results.push(turf.transformRotate(f, 90)));
        break;

      case "copy_offset":
        features.forEach(f => results.push(turf.transformTranslate(f, 0.05, 90, { units: "kilometers" })));
        break;

      default:
        throw new Error(`Инструмент ${tool} не реализован.`);
    }

    return results;
  } catch (err: any) {
    alert(`Ошибка Turf.js: ${err.message}`);
    return null;
  }
};
