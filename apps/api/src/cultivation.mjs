// Optional growing-period metadata on the existing field record. Legacy records remain valid.
export function validateCultivation(data) {
  const value = data.cultivation;
  if (value === undefined) return;
  const invalid = () => { throw Object.assign(new Error('Проверьте период выращивания: стадию и дату посадки'), {status: 400}); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['seasonId','stage','plantedOn'].includes(key))) invalid();
  if (typeof value.seasonId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.seasonId)) invalid();
  if (value.stage !== undefined && !['seedling','vegetative','mature'].includes(value.stage)) invalid();
  if (value.plantedOn !== undefined && (typeof value.plantedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.plantedOn) || !Number.isFinite(Date.parse(value.plantedOn)) || new Date(value.plantedOn).toISOString().slice(0,10) !== value.plantedOn)) invalid();
}
