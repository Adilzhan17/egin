import type { WeatherState } from '../../entities/weather/use-weather';
import { WeatherPanel } from './WeatherPanel';
export default function WeatherPage({ weather }: { weather: WeatherState }) {
  return <div className="weather-page"><header className="weather-page-heading"><div><span className="eyebrow">Прогноз для участка</span><h1>Погода</h1></div><span className="weather-page-brand">egin.</span></header><WeatherPanel weather={weather} /></div>;
}
