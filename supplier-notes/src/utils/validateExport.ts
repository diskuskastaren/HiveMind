import type { ExportData } from '../store/store';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function validateExport(value: unknown): ExportData {
  if (!isRecord(value) || !Number.isInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 5) {
    throw new Error('Unsupported backup version');
  }
  for (const key of ['suppliers', 'notes', 'tasks', 'decisions']) {
    const items = value[key];
    if (!Array.isArray(items) || items.some((item) => !isRecord(item) || typeof item.id !== 'string')) {
      throw new Error(`Invalid ${key} in backup`);
    }
    if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`Duplicate ${key} IDs`);
  }
  for (const key of ['projects', 'followUps']) {
    const items = value[key];
    if (items !== undefined && (!Array.isArray(items) || items.some((item) => !isRecord(item) || typeof item.id !== 'string'))) {
      throw new Error(`Invalid ${key} in backup`);
    }
  }
  if (Number(value.version) >= 2 && !Array.isArray(value.projects)) throw new Error('Projects are missing from backup');
  return value as unknown as ExportData;
}
