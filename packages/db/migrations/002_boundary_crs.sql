-- Repair only early imported projected coordinates mislabeled as EPSG:4326.
-- Fresh imports now read .prj and explicitly transform from EPSG:3857.
UPDATE admin_boundaries SET geometry=ST_Transform(ST_SetSRID(geometry,3857),4326)
WHERE ST_XMax(geometry)>180;
UPDATE fields f SET
 region_id=(SELECT id FROM admin_boundaries a WHERE a.level=1 AND ST_Intersects(a.geometry,f.geometry) ORDER BY ST_Area(ST_Intersection(a.geometry,f.geometry)::geography) DESC LIMIT 1),
 district_id=(SELECT id FROM admin_boundaries a WHERE a.level=2 AND ST_Intersects(a.geometry,f.geometry) ORDER BY ST_Area(ST_Intersection(a.geometry,f.geometry)::geography) DESC LIMIT 1);
