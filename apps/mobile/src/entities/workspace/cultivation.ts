import type {Field} from './types';
import type {CropId} from '../field/types';

export type GrowthStage = 'seedling' | 'vegetative' | 'mature';
export type Cultivation = {seasonId: string; stage?: GrowthStage; plantedOn?: string};
export const growthStages: {id: GrowthStage; name: string}[] = [{id:'seedling',name:'Всходы / молодое растение'},{id:'vegetative',name:'Вегетация'},{id:'mature',name:'Зрелость / плодоношение'}];
export function fieldScene(field?: Field): {crop: CropId; stage: number; illustrative: boolean; stageLabel: string} {
  const crop = field?.crop && field.crop !== 'unknown' ? field.crop : 'wheat';
  const stage = field?.crop && field.crop !== 'unknown' ? field.cultivation?.stage : undefined;
  return {crop,stage:stage==='seedling'?0:stage==='vegetative'?1:3,illustrative:!stage,stageLabel:growthStages.find(item=>item.id===stage)?.name || 'Стадия неизвестна · зрелое растение для примера'};
}
