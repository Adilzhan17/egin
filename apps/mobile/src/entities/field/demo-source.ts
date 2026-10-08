import { crops } from './catalog.ts';
import type { FieldDataSource, WeatherId } from './types.ts';

const weather: Record<WeatherId, { label: string; temperature: number; wind: number; rain: number; humidity: number; soilMoisture: number; advice: { title: string; text: string } }> = {
  sun: { label: 'Ясно', temperature: 23, wind: 9, rain: 0, humidity: 58, soilMoisture: 42, advice: { title: 'Время посмотреть на поле', text: 'Отметьте состояние листьев и влажность почвы. Наблюдения помогут следить за изменениями.' } },
  rain: { label: 'Дождь', temperature: 17, wind: 14, rain: 3.2, humidity: 86, soilMoisture: 64, advice: { title: 'Сегодня поле под дождём', text: 'После дождя осмотрите низины и отметьте застой воды. Решение о поливе требует проверки почвы.' } },
  wind: { label: 'Ветрено', temperature: 21, wind: 32, rain: 0, humidity: 39, soilMoisture: 34, advice: { title: 'Обратите внимание на ветер', text: 'Перед полевыми работами уточните условия на месте. Осмотрите стебли и опоры после сильных порывов.' } },
  night: { label: 'Ясная ночь', temperature: 12, wind: 5, rain: 0, humidity: 73, soilMoisture: 45, advice: { title: 'Поле отдыхает до утра', text: 'Сохраните наблюдение для следующего осмотра. Дневная и ночная температура показаны отдельно.' } },
};

/** Illustrative fixtures only. Never treated as telemetry or an agronomic model. */
export const demoSource: FieldDataSource = {
  getSnapshot(cropId, weatherId, stage) {
    const w = weather[weatherId];
    return {
      crop: crops[cropId], weather: weatherId, stage,
      source: 'demo', sourceLabel: 'Пример данных · не измерения',
      weatherLabel: w.label, ...w,
      factors: [
        { id: 'temperature', label: 'Температура воздуха', value: w.temperature, unit: '°C', group: 'weather', description: 'Температура в демонстрационном сценарии. В реальном хозяйстве здесь будет прогноз для координат поля.' },
        { id: 'wind', label: 'Скорость ветра', value: w.wind, unit: 'км/ч', group: 'weather', description: 'Ветер влияет на наклон и движение растения в сцене. Показатель не заменяет измерение на участке.' },
        { id: 'rain', label: 'Осадки за час', value: w.rain, unit: 'мм', group: 'weather', description: 'При дожде появляются капли, а поверхность почвы темнеет. Это визуализация выбранного сценария.' },
        { id: 'humidity', label: 'Влажность воздуха', value: w.humidity, unit: '%', group: 'weather', description: 'Влажность воздуха и влажность почвы — разные показатели. Значения в этой версии заданы для примера.' },
        { id: 'light', label: 'Освещённость', value: weatherId === 'night' ? 0 : weatherId === 'rain' ? 16 : 48, unit: 'тыс. лк', group: 'weather', description: 'Пример освещённости. Ночью меняются свет и окружение 3D-сцены.' },
        { id: 'soilMoisture', label: 'Влажность почвы', value: w.soilMoisture, unit: '%', group: 'soil', description: 'Демонстрационный показатель. Для решения о поливе нужны измерения, глубина отбора и тип почвы.' },
        { id: 'soilTemperature', label: 'Температура почвы', value: w.temperature - 3, unit: '°C', group: 'soil', description: 'Пример температуры верхнего слоя. В рабочей версии источник и глубина будут указаны рядом с измерением.' },
        { id: 'ph', label: 'Кислотность', value: 6.7, unit: 'pH', group: 'soil', description: 'Для точного pH нужен лабораторный анализ. Значение 6,7 приведено только для демонстрации интерфейса.' },
        { id: 'nitrogen', label: 'Азот', value: 32, unit: 'мг/кг', group: 'soil', description: 'Пример данных почвенного анализа. Дозы удобрений по этим значениям не рассчитываются.' },
        { id: 'phosphorus', label: 'Фосфор', value: 24, unit: 'мг/кг', group: 'soil', description: 'Пример содержания фосфора. Для интерпретации нужны метод лаборатории и дата анализа.' },
        { id: 'potassium', label: 'Калий', value: 210, unit: 'мг/кг', group: 'soil', description: 'Пример содержания калия. Фактические значения могут различаться внутри одного поля.' },
        { id: 'organic', label: 'Органическое вещество', value: 3.4, unit: '%', group: 'soil', description: 'Иллюстративное значение; не оценка почвы конкретного хозяйства.' },
        { id: 'height', label: 'Высота растения', value: Math.round(([22, 46, 78, 92][stage] ?? 78) * (cropId === 'apple' ? 2.1 : cropId === 'sunflower' ? 1.6 : 1)), unit: 'см', group: 'plant', description: 'Высота условного растения выбранной фазы. 3D-модель схематична и не является измерением биомассы.' },
        { id: 'growth', label: 'Фаза развития', value: stage + 1, unit: 'из 4', group: 'plant', description: 'Фазу выбирают по наблюдению за растением. В демонстрации её можно менять в настройках сцены.' },
        { id: 'pests', label: 'Вредители', value: null, unit: '', group: 'plant', description: 'Осмотр ещё не внесён. Отсутствие данных не означает отсутствие вредителей.' },
        { id: 'disease', label: 'Болезни', value: null, unit: '', group: 'plant', description: 'Нужен осмотр агронома или подтверждённая диагностика. По анимации состояние здоровья не определяется.' },
      ],
    };
  },
};
