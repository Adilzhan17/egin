export type CropId = 'wheat' | 'tomato' | 'apple' | 'sunflower';
export type WeatherId = 'sun' | 'rain' | 'wind' | 'night';
export type FactorGroup = 'weather' | 'soil' | 'plant';
export type Factor = {
  id: string; label: string; value: number | null; unit: string;
  group: FactorGroup; description: string; range?: [number, number];
};
export type Crop = {
  id: CropId; name: string; variety: string; field: string; area: string;
  region: string; color: string; stages: string[];
};
export type FieldSnapshot = {
  crop: Crop; weather: WeatherId; stage: number; factors: Factor[];
  source: 'demo'; sourceLabel: string;
  weatherLabel: string; temperature: number; wind: number; rain: number;
  humidity: number; soilMoisture: number; advice: { title: string; text: string };
};
export type FieldDataSource = {
  getSnapshot(crop: CropId, weather: WeatherId, stage: number): FieldSnapshot;
};
