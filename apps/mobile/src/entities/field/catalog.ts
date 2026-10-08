import type { Crop, CropId } from './types';

export const crops: Record<CropId, Crop> = {
  wheat: { id: 'wheat', name: 'Пшеница', variety: 'Яровая · Астана', field: 'Северное поле', area: '60,2 га', region: 'Акмолинская область', color: '#b5a554', stages: ['Всходы', 'Кущение', 'Колошение', 'Созревание'] },
  tomato: { id: 'tomato', name: 'Томаты', variety: 'Открытый грунт', field: 'Овощной участок', area: '0,8 га', region: 'Алматинская область', color: '#cf6245', stages: ['Рассада', 'Рост', 'Цветение', 'Плодоношение'] },
  apple: { id: 'apple', name: 'Яблоня', variety: 'Плодовый сад · Апорт', field: 'Южный сад', area: '2,4 га', region: 'Алматинская область', color: '#cf785c', stages: ['Почки', 'Листья', 'Цветение', 'Плоды'] },
  sunflower: { id: 'sunflower', name: 'Подсолнечник', variety: 'Масличный', field: 'Восточное поле', area: '18,5 га', region: 'Восточно-Казахстанская область', color: '#d8ae3e', stages: ['Всходы', 'Рост', 'Цветение', 'Созревание'] },
};
export const cropIds = Object.keys(crops) as CropId[];
