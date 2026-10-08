import type { CropId, WeatherId } from '../../entities/field/types';

export type Preferences = { crop: CropId; weather: WeatherId; stages: Record<CropId, number>; motion: boolean; completed: string[] };
export const defaults: Preferences = { crop: 'wheat', weather: 'sun', stages: { wheat: 2, tomato: 3, apple: 3, sunflower: 2 }, motion: true, completed: [] };
const KEY = 'egin.mobile.v1';
export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return { ...defaults };
  const p = value as Partial<Preferences>;
  const stages = { ...defaults.stages };
  for (const id of Object.keys(stages) as CropId[]) {
    const stage = p.stages?.[id];
    if (typeof stage === 'number' && Number.isInteger(stage) && stage >= 0 && stage <= 3) stages[id] = stage;
  }
  return {
    crop: p.crop && ['wheat', 'tomato', 'apple', 'sunflower'].includes(p.crop) ? p.crop : defaults.crop,
    weather: p.weather && ['sun', 'rain', 'wind', 'night'].includes(p.weather) ? p.weather : defaults.weather,
    stages, motion: typeof p.motion === 'boolean' ? p.motion : true,
    completed: Array.isArray(p.completed) ? p.completed.filter((id): id is string => typeof id === 'string').slice(0, 30) : [],
  };
}
export function readPreferences(): Preferences {
  try { return parsePreferences(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return { ...defaults }; }
}
export function savePreferences(p: Preferences): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; }
}
