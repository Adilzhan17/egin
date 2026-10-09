import type { Data, Entry, Field, Kind, Profile, Sensor } from '../../entities/workspace/types.ts';

export type ConflictFact = { label: string; value: string };
const crops = { wheat: 'Пшеница', tomato: 'Томаты', apple: 'Яблоня', sunflower: 'Подсолнечник', unknown: 'Не указана' };
const number = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(n);
export const kindLabel: Record<Kind, string> = { field: 'Участок', sensor: 'Датчик', entry: 'Запись', profile: 'Профиль' };
export function recordTitle(kind: Kind, data: Data): string {
  return kind === 'entry' ? (data as Entry).title : (data as Field | Sensor | Profile).name || kindLabel[kind];
}
export function changedRecordFields(local: Data, remote: Data, localDeleted: boolean, remoteDeleted: boolean): string[] {
  const names: Record<string, string> = { name: 'название', title: 'заголовок', text: 'текст', date: 'дата', assets: 'вложения', fieldId: 'привязка к участку', crop: 'культура', latitude: 'широта', longitude: 'долгота', area: 'площадь', boundary: 'границы', cadastre: 'сведения кадастра', serial: 'серийный номер', type: 'тип датчика', farm: 'хозяйство', phone: 'телефон' };
  const a = local as Record<string, unknown>, b = remote as Record<string, unknown>;
  return [...(localDeleted !== remoteDeleted ? ['удаление записи'] : []), ...Object.keys(names).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => names[key])];
}
export function conflictFacts(kind: Kind, data: Data, deleted: boolean): ConflictFact[] {
  if (deleted) return [{ label: 'Состояние', value: 'Удалена' }];
  if (kind === 'field') {
    const f = data as Field;
    return [
      { label: 'Название', value: f.name }, { label: 'Культура', value: crops[f.crop] },
      { label: 'Площадь', value: `${number(f.area)} га` }, { label: 'Кадастровый номер', value: f.cadastre?.number || 'Не указан' },
      { label: 'Границы', value: f.boundary ? `${f.boundary.coordinates[0].length - 1} вершин · вырезов: ${f.boundary.coordinates.length - 1}` : 'Не заданы' },
      { label: 'Координаты', value: `${f.latitude.toFixed(5)}, ${f.longitude.toFixed(5)}` },
    ];
  }
  if (kind === 'entry') {
    const e = data as Entry;
    return [{ label: 'Заголовок', value: e.title }, { label: 'Дата', value: e.date }, { label: 'Текст', value: e.text || 'Нет текста' }, { label: 'Вложения', value: String(e.assets.length) }];
  }
  if (kind === 'sensor') {
    const s = data as Sensor;
    return [{ label: 'Название', value: s.name }, { label: 'Серийный номер', value: s.serial }, { label: 'Тип', value: { moisture: 'Влажность почвы', temperature: 'Температура', weather: 'Метеостанция' }[s.type] }];
  }
  const p = data as Profile;
  return [{ label: 'Имя', value: p.name }, { label: 'Хозяйство', value: p.farm || 'Не указано' }, { label: 'Телефон', value: p.phone || 'Не указан' }];
}
