import type { CropId } from './types';

/** A server-side adapter will combine weather, sensor readings and the keyed API.
 * Provider credentials must stay on the server, outside the PWA / native bundle.
 * Weather alone does not identify a crop's actual phenological stage.
 */
export type CropMonitoring = {
  crop: CropId;
  stage: number | null;
  stageSource: 'automatic' | 'pending';
  observedAt: string | null;
  soilMoisture: number | null;
  soilTemperature: number | null;
};
export interface CropMonitoringSource {
  getMonitoring(crop: CropId, signal?: AbortSignal): Promise<CropMonitoring>;
}
export function pendingMonitoring(crop: CropId): CropMonitoring {
  return { crop, stage: null, stageSource: 'pending', observedAt: null, soilMoisture: null, soilTemperature: null };
}
/** A representative visual, never a measured or user-selected growth stage. */
export const modelStage: Record<CropId, number> = { wheat: 2, tomato: 3, apple: 3, sunflower: 2 };
