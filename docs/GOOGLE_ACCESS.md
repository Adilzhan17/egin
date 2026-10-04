# Google access and provider boundaries

Verified against official documentation on **2026-10-04**. Google activation is deferred at the user's request. No Google key, registered project, service-account credentials or WeatherNext subscription was configured in the local EGIN environment at inspection. No paid API calls, billing changes, cloud resources or access requests were made. Automated provider checks below are **mock protocol tests**, not successful live integrations.

## Weather API

`GoogleWeatherProvider` implements the documented server-side current, hourly forecast, daily forecast and hourly history endpoints. Normal operation requests current conditions, 24 forecast hours and 7 forecast days concurrently. History is an explicit separate request, limited to the preceding 24 hours. Requests use the saved field centroid and `METRIC`; the response timezone is retained. Unknown values remain null. [API reference](https://developers.google.com/maps/documentation/weather/reference/rest), [hourly history](https://developers.google.com/maps/documentation/weather/hourly-history).

Production requires an enabled Weather API, billing and a restricted server API key. Maps Demo Keys are for prototypes, not production. Scope the key to Weather API and the server's egress IP; never set a `NEXT_PUBLIC_` key. Authentication uses the `X-Goog-Api-Key` header so secrets do not appear in URLs or exception messages. [Setup](https://developers.google.com/maps/documentation/weather/get-api-key), [key security](https://developers.google.com/maps/api-security-best-practices), [header authentication](https://docs.cloud.google.com/docs/authentication/api-keys-use).

`weather_with_fallback` selects Google only when both the feature flag and key exist. Requests have an 8-second overall deadline; errors and missing coverage fall back to the existing Open-Meteo provider. A 60-second retry cooldown prevents repeated failed Google calls. Coverage does not guarantee every remote field has data. [Coverage and billing FAQ](https://developers.google.com/maps/documentation/weather/faq).

Google current conditions and hourly forecasts have a **one-hour maximum cache period** under the linked non-EEA terms. EGIN uses a bounded process-memory cache for 15 minutes, with timed eviction, and marks `cache_policy.persist=false`. Do not store these snapshots in IndexedDB, bootstrap disk caches, ML results, assistant traces or generic PostgreSQL weather caches. Persistent analysis/tool contexts continue to use Open-Meteo. Daily/history permissions differ; the implementation deliberately uses the stricter nonpersistent policy for the combined response. These application retention rules are not a claim of full licensing compliance; billing-address-specific terms still apply. [Weather service-specific terms §21](https://cloud.google.com/maps-platform/terms/maps-service-terms#21.-weather-api).

**Display work remains before activation:** the common UI currently displays the source name; it has not passed a Google attribution acceptance check. The policy requires visible Google Maps attribution and additionally specifies `Source: Includes weather data from Google` beside Weather content. Modified/derived content has separate attribution wording and styling requirements. The backend's `attribution` field alone does not satisfy those display requirements. Keep Google disabled until the relevant UI is implemented and checked with an authorized live response. [Attribution requirements](https://developers.google.com/maps/documentation/weather/policies).

The common weather shape includes a display-only approximation from Google conditions to WMO icon codes. Daily wind represents the maximum of the two day/night period forecasts, not an observed gust maximum. ET0 and other measurements Google does not supply remain null. These meanings are included in `normalization_notes`; no values are fabricated.

## WeatherNext 3

WeatherNext 3 is real, released in August 2026. The official model documentation describes global ensemble forecasts with 64 members. It is distinct from the Maps Weather API. Operational datasets require allowlisting; one request covers Earth Engine, BigQuery and Cloud Storage. Requesting data access itself does not require an existing paid Google Cloud contract, but execution/storage services have their own costs and access requirements. [Model](https://developers.google.com/weathernext/guides/models), [access instructions](https://developers.google.com/weathernext/guides/access-forecast).

Operational forecasts are **not blanket CC BY data**. Data relating to the future or less than one hour ago is governed by the GDM Real-Time Weather Forecasting Experimental Data Terms; data relating to at least one hour ago is CC BY 4.0. The distinction concerns the forecast's valid time, not how long EGIN has held its response. A one-hour application cache is not permission to redistribute every forecast. WeatherNext display, retention and reuse need the applicable terms checked before enabling the adapter; that live acceptance work is deferred. [Data licensing and disclaimers](https://developers.google.com/weathernext/guides/disclaimers).

Implemented path: `GoogleWeatherNextProvider` queries an **already linked** Analytics Hub BigQuery table ending in `weathernext_3_0_0_0p1deg`. It requires an explicit initialization timestamp, filters that partition and the grid cell containing the field centroid, and returns up to 168 hourly points with mean/p10/p90 temperature and precipitation. Kelvin→°C, m/s→km/h and one-hour precipitation metres→mm conversions happen on the server. SQL parameters bind coordinates and time. The default `maximumBytesBilled` is 100 MB; the permitted configured range is 1 MB–1 GB. No automatic subscription, unrestricted scan or background paid query is performed. [BigQuery schema](https://developers.google.com/weathernext/guides/bigquery), [REST query cost limits](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query).

Other documented surfaces: Earth Engine collection `projects/gcp-public-data-weathernext/assets/weathernext_3_0_0_0p1deg`; GCS `gs://weathernext3_statistics_spatial/` and `gs://weathernext3_spatial/` Zarr v3 stores. EGIN does not download either global store, expose them to phones or pretend the BigQuery adapter is also an implemented GCS/EE WeatherNext adapter. Those are alternative future extractors behind the same field-subset contract. [Earth Engine guide](https://developers.google.com/weathernext/guides/earth-engine), [GCS guide](https://developers.google.com/weathernext/guides/gcs).

The REST adapter accepts a server OAuth token or a rotating token file. The file is reread per query so the deployment's credential manager can refresh short-lived tokens. It does not mint long-lived credentials or silently treat a static access token as renewable. Missing, expired or unauthorized tokens return an explicit unavailable state. Production needs an operator-provisioned rotation mechanism before enabling the flag.

## Agricultural Understanding: ALU / AMED

The platform provides real REST endpoints `v1:lookupLandscape` and `v1:monitorLandscape`, returning GeoJSON encoded in `landscape.geojson` / `monitoredLandscape.geojson`. `GoogleAgricultureProvider` implements those contracts, but **Kazakhstan is disabled**: the official platform FAQ currently confirms India only. The API additionally requires project billing and allowlisting of a Workspace customer ID and the enabling user's email. Setting a feature flag cannot grant access or change coverage. [Coverage FAQ](https://agri.withgoogle.com/faq/), [API setup](https://developers.google.com/agricultural-understanding/api), [ALU endpoint](https://developers.google.com/agricultural-understanding/reference/rest/v1/TopLevel/lookupLandscape), [AMED endpoint](https://developers.google.com/agricultural-understanding/reference/rest/v1/TopLevel/monitorLandscape).

For Kazakhstan the route returns `unsupported_region` with `fallback=own_field_polygon` metadata; it does not return a Google polygon. EGIN's ordinary field endpoints remain the source of saved authoritative polygons. Local polygons and mock crop predictions are never labelled as Google output. Sentinel observations are a separate optional integration below.

## Earth Engine

`GoogleEarthEngineProvider` contains a server-only Sentinel-2 extractor using the official optional `earthengine-api` SDK. It accepts an authorized saved field polygon, limits a request to 31 days, 12 scenes and 1 million pixels per scene, masks SCL vegetation/bare-soil/water classes, and calculates NDVI/NDMI/EVI at 20 m. Only small date/index summaries leave the server. Missing/cloud-covered observations remain absent. Results are cached for one day by field revision; geometry changes invalidate the key. Sentinel-1/radar and raster tile export are not implemented in this increment. [Sentinel-2 dataset](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED).

Live execution is blocked until the operator registers an existing Cloud project for the appropriate commercial/noncommercial use, enables Earth Engine, grants the service-account permissions, mounts server credentials and installs the official SDK. The current base image does not include that optional SDK. EGIN reports the blocker and keeps fields/ordinary weather working. No SDK install or cloud registration is performed automatically. [Access requirements](https://developers.google.com/earth-engine/guides/access).

## Server configuration

All flags default to disabled. Set only on `core`; none belongs in the browser build.

```dotenv
FEATURE_GOOGLE_WEATHER=false
GOOGLE_WEATHER_API_KEY=
FEATURE_GOOGLE_WEATHERNEXT=false
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_ACCESS_TOKEN_FILE=
# Short-lived alternative for controlled tests; prefer a rotating token file.
GOOGLE_CLOUD_ACCESS_TOKEN=
GOOGLE_WEATHERNEXT_BQ_TABLE=
GOOGLE_WEATHERNEXT_BQ_LOCATION=US
GOOGLE_WEATHERNEXT_MAX_BYTES_BILLED=100000000
FEATURE_GOOGLE_AGRICULTURE=false
GOOGLE_AGRICULTURE_API_KEY=
FEATURE_GOOGLE_EARTH_ENGINE=false
GOOGLE_APPLICATION_CREDENTIALS=
```

Authenticated endpoints: `/integrations/google`, `/fields/{id}/weather/history`, `/fields/{id}/weather-next?init_time=<RFC3339>&hours=72`, `/fields/{id}/agriculture`, `/fields/{id}/satellite-indices`. Field membership is checked before any provider call. The status endpoint reports configuration, **not verified access**.

`tests/test_google_providers.py` covers actual HTTP request shapes with mock transport, units/timezone, missing values, secret-safe failures, disabled/missing-key fallback, retry cooldown, concurrent cache reuse, bounded parameterized BigQuery queries, Kazakhstan coverage gating and route authorization. Live Weather/WeatherNext/ALU/AMED/EE validation remains blocked by the respective credentials/access/SDK prerequisites.

When the user resumes the Google stage, provision a restricted Google Weather key in server secret configuration (`GOOGLE_WEATHER_API_KEY`), complete the outstanding attribution/access checks above, and only then enable `FEATURE_GOOGLE_WEATHER`. Do not paste keys into chat. No credentials or activation are requested now; the rest of EGIN remains usable with the existing providers.
