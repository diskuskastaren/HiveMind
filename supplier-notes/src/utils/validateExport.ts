import type { ExportData } from '../store/store';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The text field every record of a collection must have. These match the checks the
 * desktop storage layer applies before writing (electron/storage.cjs `validateData`):
 * accepting an import the storage layer later rejects would make every save fail.
 */
const REQUIRED_TEXT: Record<string, string> = {
  projects: 'name', suppliers: 'name', notes: 'title', tasks: 'title', decisions: 'text', followUps: 'text',
};

const ARRAY_FIELDS: Record<string, string[]> = {
  suppliers: ['projectIds'],
  notes: ['projectIds', 'supplierIds', 'transcripts', 'attachments', 'sections'],
  tasks: ['attachments', 'updates'],
  decisions: ['relatedTaskIds', 'history'],
};

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
    if (Array.isArray(items) && new Set(items.map((item) => (item as Record<string, unknown>).id)).size !== items.length) {
      throw new Error(`Duplicate ${key} IDs`);
    }
  }
  if (Number(value.version) >= 2 && !Array.isArray(value.projects)) throw new Error('Projects are missing from backup');
  for (const [key, field] of Object.entries(REQUIRED_TEXT)) {
    for (const item of (value[key] as Record<string, unknown>[] | undefined) || []) {
      if (typeof item[field] !== 'string') throw new Error(`A record in ${key} has no ${field}`);
    }
  }
  for (const [key, fields] of Object.entries(ARRAY_FIELDS)) {
    for (const item of (value[key] as Record<string, unknown>[] | undefined) || []) {
      for (const field of fields) {
        if (item[field] != null && !Array.isArray(item[field])) throw new Error(`A record in ${key} has an invalid ${field}`);
      }
    }
  }
  return value as unknown as ExportData;
}
