import type { Field, Row, Sensor } from '../../entities/workspace/types.ts';
import type { LiveWeatherReport } from '../../entities/weather/live-types.ts';

export function fieldReadiness(field: Row<Field> | undefined, sensors: Row<Sensor>[], report: LiveWeatherReport | null, cached: boolean, now = Date.now()) {
  if (!field) return { sensorCount: 0, weather: 'missing' as const, next: { href: '/fields', title: 'Найти мой участок', description: 'По кадастровому номеру, на карте или из файла границ.' } };
  const sensorCount = sensors.filter(s => s.owner === field.owner && !s.deleted && s.data.fieldId === field.id).length;
  const matches = report && Math.abs(report.location.latitude - field.data.latitude) < .0001 && Math.abs(report.location.longitude - field.data.longitude) < .0001;
  const observed = matches ? Date.parse(report.current.time) : NaN;
  const weather = !matches ? 'missing' : cached || !Number.isFinite(report.fetchedAt) || report.fetchedAt > now + 60000 || !Number.isFinite(observed) || now - observed > 3 * 3600000 || observed > now + 3600000 || now - report.fetchedAt > 3 * 3600000 ? 'saved' : 'current';
  const next = field.conflict ? { href: '/settings/sync', title: 'Сравнить изменения участка', description: 'На телефоне и сервере разные версии. Выберите нужную.' }
    : field.data.cadastre?.source === 'demo' ? { href: '/fields', title: 'Добавить собственный участок', description: 'Сейчас выбрана учебная земля. Её данные не описывают ваше хозяйство.' }
    : !field.data.boundary ? { href: '/fields', title: 'Добавить границы участка', description: 'Сейчас сохранена только точка. Найдите контур по кадастру или загрузите файл.' }
    : field.data.cadastre?.source === 'public-map' && !field.data.cadastre.details ? { href: '/fields', title: 'Загрузить сведения ЕГКН', description: 'Откройте участок и нажмите «Загрузить сведения ЕГКН».' }
    : weather !== 'current' ? { href: '/weather', title: weather === 'saved' ? 'Проверить свежий прогноз' : 'Открыть погоду участка', description: weather === 'saved' ? 'Сохранённые условия могут отличаться от текущих.' : 'Прогноз загружается для координат выбранной земли.' }
    : !sensorCount ? { href: '/settings/sensors', title: 'Подготовить подключение датчика', description: 'Добавьте устройство в реестр и привяжите к участку. Приём показаний ещё в разработке.' }
    : { href: '/events', title: 'Открыть события участка', description: 'Посмотрите погоду, изменения и историю обмена.' };
  return { sensorCount, weather, next };
}
