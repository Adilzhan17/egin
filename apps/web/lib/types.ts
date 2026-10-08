import type { MultiPolygon, Polygon } from "geojson";
export type Geometry = Polygon | MultiPolygon;
export type User = {
  id: string;
  email: string | null;
  name: string;
  language: "ru" | "kk";
  region: string;
  onboarded: boolean;
};
export type Farm = { id: string; name: string; region: string; role: string };
export type Crop = { id: string; name_ru: string; name_kk: string };
export type Region = {
  id: string;
  name_ru: string;
  name_kk: string;
  source_version: string;
};
export type Field = {
  id: string;
  farm_id: string;
  name: string;
  crop_id: string | null;
  crop_name: string | null;
  area_ha: number;
  geometry: Geometry;
  lat: number;
  lon: number;
  region: string | null;
  district: string | null;
  boundary_version: string;
  revision: number;
  farm_name: string;
  created_at: string;
  updated_at: string;
};
export type SourceStatus = "fresh" | "cached" | "stale" | "unavailable";
export type Source = {
  source: string;
  source_url?: string;
  status: SourceStatus;
  fetched_at: string | null;
  message?: string;
};
export type WeatherDay = {
  date: string;
  temperature_2m_max: number;
  temperature_2m_min: number;
  precipitation_sum: number;
  precipitation_probability_max: number;
  wind_speed_10m_max: number;
  weather_code: number;
  et0_fao_evapotranspiration: number;
  shortwave_radiation_sum: number;
};
export type Weather = Source & {
  timezone?: string;
  requested_coordinates?: { lat: number; lon: number };
  days?: WeatherDay[];
  current?: {
    time?: string;
    apparent_temperature?: number;
    precipitation?: number;
    is_day?: number;
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  hourly?: Record<string, number[] | string[]>;
};
export type Soil = Source & {
  depth?: string;
  topsoil?: Record<string, number>;
  units?: Record<string, string>;
  uncertainty?: Record<string, Record<string, number>>;
  texture?: string;
  warning?: string;
  resolution_m?: number;
};
export type Climate = Source & {
  period?: string;
  growing_temperature?: number;
  growing_precipitation?: number;
  definition?: string;
};
export type Recommendation = {
  model_version?: string;
  dataset_kind?: string;
  candidates?: { crop: string; score: number }[];
  warning: string;
  reasons?: string[];
  feature_importance?: Record<string, number>;
  missing_features?: string[];
};
export type Analysis = {
  id: string;
  field: { name: string; revision: number };
  weather: Weather;
  soil: Soil;
  climate: Climate;
  recommendation: Recommendation;
  risk: {
    level: string;
    flags: { code: string; level: string; text: string }[];
  };
  created_at: string;
  geometry_changed?: boolean;
};
export type Listing = {
  id: string;
  user_id: string;
  type: "product" | "machinery_rental" | "service" | "job";
  title: string;
  description: string;
  price: number;
  unit: string;
  region: string;
  lat: number | null;
  lon: number | null;
  is_demo: boolean;
  status: string;
  seller_name: string;
  is_favorite: boolean;
  images: { id: string; path: string }[];
};
export type Conversation = {
  id: string;
  title: string;
  kind: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  version?: number | string;
  last_message_id?: number;
};
export type ChatAttachment = {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  url: string;
  kind: "image" | "document";
};
export type Message = {
  id: number;
  user_id: string;
  name: string;
  body: string;
  client_id: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  conversation_id?: string;
  version?: number | string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: number | null;
  reply_preview?: {
    id: number;
    user_id: string;
    name: string;
    body: string;
    deleted_at?: string | null;
  } | null;
  attachments?: ChatAttachment[];
  field_card?: {
    field_id: string;
    name: string;
    area_ha: number;
    region?: string;
    lat?: number;
    lon?: number;
    geometry?: Geometry;
  } | null;
  forwarded_from?:
    | number
    | string
    | { name?: string; message_id?: number }
    | null;
  reactions?: { emoji: string; count: number; user_ids: string[] }[];
};
export type News = {
  id: string;
  title: string;
  summary: string;
  source: string;
  external_url: string | null;
  published_at: string | null;
  tags: string[];
  regions: string[];
  crop_tags: string[];
  is_demo: boolean;
  relevance: number;
};
export type AssistantAnswer = {
  text: string;
  mode: string;
  tools: string[];
  data: unknown;
};
export type Dashboard = {
  fields_count: number;
  area_ha: number;
  crops: Record<string, number>;
  fields: Field[];
  active_listings: number;
  unread_messages: number;
  analyses: { field_id: string; result: Analysis; created_at: string }[];
  scope: string;
};
