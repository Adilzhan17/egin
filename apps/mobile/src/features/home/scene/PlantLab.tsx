import type { WeatherCondition } from '../../../entities/weather/live-types';
import { Icon, type IconName } from '../../../shared/ui/Icon';
import './plant-lab.css';

export type PlantPeriod = 'dawn' | 'day' | 'dusk' | 'night';
export const plantLabEnabled = (hostname: string) => ['dev-egin.perricheno.com', 'localhost', '127.0.0.1'].includes(hostname);
export const plantPhases = ['Семя', 'Росток', 'Рост', 'Зрелость'];
const periods: { id: PlantPeriod; label: string; icon: IconName }[] = [
  { id: 'dawn', label: 'Утро', icon: 'sunrise' }, { id: 'day', label: 'День', icon: 'sun' },
  { id: 'dusk', label: 'Закат', icon: 'sunrise' }, { id: 'night', label: 'Ночь', icon: 'night' },
];
const conditions: { id: WeatherCondition; label: string; icon: IconName }[] = [
  { id: 'sun', label: 'Ясно', icon: 'sun' }, { id: 'cloud', label: 'Облачно', icon: 'cloud' },
  { id: 'rain', label: 'Дождь', icon: 'rain' }, { id: 'snow', label: 'Снег', icon: 'snow' },
  { id: 'storm', label: 'Гроза', icon: 'storm' }, { id: 'wind', label: 'Ветер', icon: 'wind' },
];
export function PlantEnvironment({ period, condition, automatic, description, onPeriod, onCondition, onAutomatic }: {
  period: PlantPeriod; condition: WeatherCondition; automatic: boolean; description: string;
  onPeriod: (period: PlantPeriod) => void; onCondition: (condition: WeatherCondition) => void; onAutomatic: () => void;
}) {
  return <div className="plant-lab-controls">
    <p>Проверьте, как выглядит растение при разной погоде и освещении. Это только визуальный пример.</p>
    <button className="scene-auto" aria-pressed={automatic} onClick={onAutomatic}><Icon name="location" size={20} /><span>По погоде участка<small>{description}</small></span>{automatic && <Icon name="check" size={18} />}</button>
    <fieldset><legend>Время суток</legend><div className="plant-lab-choices periods">{periods.map(item => <button key={item.id} aria-pressed={period === item.id} onClick={() => onPeriod(item.id)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}</div></fieldset>
    <fieldset><legend>Погода</legend><div className="plant-lab-choices">{conditions.map(item => <button key={item.id} aria-pressed={(condition === 'night' ? 'sun' : condition) === item.id} onClick={() => onCondition(item.id)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}</div></fieldset>
  </div>;
}
export function PlantPhases({ phase, onChange }: { phase: number; onChange: (value: number) => void }) {
  const descriptions = ['Жизнь начинается под землёй', 'Первые листья и молодые корни', 'Растение набирает силу', 'Взрослая культура'];
  return <div className="plant-lab-controls"><p>Четыре иллюстрации развития культуры. Просмотр не меняет данные участка: фактическая фаза пока не определена.</p><div className="plant-phase-choices">{plantPhases.map((label, index) => <button key={label} aria-label={label} aria-pressed={phase === index} onClick={() => onChange(index)}><span className="plant-phase-number">0{index + 1}</span><span><strong>{label}</strong><small>{descriptions[index]}</small></span>{phase === index && <Icon name="check" size={19} />}</button>)}</div></div>;
}
