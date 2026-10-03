const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const parseEnvBoolean = (
  value: string | undefined,
  defaultValue = false,
) => {
  if (value === undefined) {
    return defaultValue;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
};

export const parseEnvNumber = (
  value: string | undefined,
  defaultValue: number,
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export const parseEnvList = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};
