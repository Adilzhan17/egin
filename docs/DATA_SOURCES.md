# Data sources

## Current weather

[Open-Meteo](https://open-meteo.com/en/docs), CC BY 4.0. Request: PostGIS centroid latitude/longitude, `timezone=auto`, seven forecast days, wind explicitly in km/h. Current and daily values are separate. WMO icons follow actual weather codes; date labels use the returned timezone. Thirty-minute cache, maximum stale forecast three hours. Errors and stale status remain visible.

`GET /api/weather/debug?fieldId=...` requires field access and returns field ID, exact centroid, checked time, provider request, raw response and normalized data. `artifacts/weather-verification.json` contains a direct-API comparison from this workspace. The weather grid coordinate is retained separately from the requested centroid. Original source used the largest plot for dashboard weather; the new dashboard has an explicit persistent current-field selector.

## Soil

Priority: **SoilGrids WCS → WebDAV/VRT subset → OpenLandMap COG → saved cache**. No SoilGrids REST fetch remains. Complete cache is reused for 30 days; partial results retry after five minutes. On refresh the ordered raster providers supply missing properties while retaining per-property cached provenance. Invalid zero pH/bulk density and negative raster values are rejected. Calls execute in bounded subprocesses so hung GDAL requests can be killed.

[ISRIC WCS](https://docs.isric.org/globaldata/soilgrids/wcs_from_R.html): three 250 m layers, 0–5, 5–15 and 15–30 cm, depth-weighted by 5/10/15. Coordinates transform to Interrupted Goode Homolosine for a small WCS subset. Some WCS TIFFs omit CRS metadata; the requested native CRS is used explicitly. [Mapped units](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html): pH /10, SOC /10 g/kg, texture /10 percent, bulk density /100 kg/dm³, CEC /10 cmol(c)/kg, nitrogen /100 g/kg. Unit tests cover these conversions and incomplete depths.

[WebDAV](https://files.isric.org/soilgrids/latest/data/): VRT point windows, no full global raster download. SoilGrids 2.0, CC BY 4.0, rolling dataset updates. [OpenLandMap](https://stac.openlandmap.org/): checked STAC asset metadata under `data/`, 120 m 0–30 cm COG samples. Individual property source/resolution is retained when providers are combined. Partial data stays partial; missing properties are never filled with synthetic values. Previously cached real SoilGrids REST values remain usable as saved data but are not a live dependency.

UI wording: estimated soil characteristics from a global model, not precise laboratory measurements of the field. Mean estimates do not include a confidence interval unless the provider actually supplied quantiles.

## Historical climate

[NASA POWER](https://power.larc.nasa.gov/docs/), public data. Last three complete years; May–August seasonal aggregates. Temperature, rainfall, solar radiation and wind retained. This short historical summary is not a 30-year climate normal and is not a weather forecast.

## Maps, boundaries, geocoding

Original Google raster/satellite sources are retained with attribution; imagery availability depends on the external provider. Polygon editing works independently of raster loading. [HDX/UNHCR Kazakhstan boundaries](https://data.humdata.org/dataset/cod-ab-kaz), version 2023, CC BY-IGO, 239 imported features. [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), attributed OpenStreetMap geocoding, Kazakhstan-only explicit searches, serialized at over one second and cached.

## News and demo records

`news_items` stores RSS source links, dates and labels; imported AgroInfo articles are not generated news. Unavailable feeds do not become invented current events. Demo editorials, marketplace offers and channel history are visibly labelled. Live weather and soil values are never seeded. Marketplace, tasks, notes, messages and analyses use persistent records, not UI arrays.
