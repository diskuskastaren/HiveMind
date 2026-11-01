import { toast } from 'sonner';
import { persistStorage, useStore } from '../store/store';
import { validateExport } from './validateExport';

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Import a JSON export. Importing replaces the whole workspace, so when there is data to lose the
 * user confirms first, and in the desktop app an automatic backup of the current data is made
 * before anything is replaced (restorable under Settings → Data).
 */
export async function importBackupFile(file: File) {
  let data;
  try {
    data = validateExport(JSON.parse(await file.text()));
  } catch (error) {
    toast.error('Invalid backup file', {
      description: error instanceof SyntaxError ? 'The file is not valid JSON.' : (error as Error).message || 'Please select a HiveMind JSON export.',
    });
    return;
  }

  const current = useStore.getState();
  const existing = current.projects.length + current.suppliers.length + current.notes.length +
    current.tasks.length + current.decisions.length + current.followUps.length;
  const api = (window as any).electronStore;
  const summary = `${plural(data.notes.length, 'note')}, ${plural(data.tasks.length, 'task')}, ${plural(data.decisions.length, 'decision')}`;

  const run = async () => {
    if (existing > 0 && api?.backup) {
      try {
        await persistStorage.flush();
        await api.backup();
      } catch (error) {
        toast.error('Import cancelled', { description: `The current data could not be backed up first: ${(error as Error).message || error}` });
        return;
      }
    }
    useStore.getState().importData(data);
    toast.success('Data imported', {
      description: `${file.name} · ${summary}${existing > 0 && api?.backup ? ' · previous data kept as a backup' : ''}`,
    });
  };

  if (existing === 0) return run();
  current.openConfirmDialog({
    title: 'Replace all data?',
    message: `Importing “${file.name}” (${summary}) replaces every project, supplier, note, task, decision and follow-up currently in HiveMind. ` +
      (api?.backup
        ? 'A backup of the current data is created first; you can restore it under Settings → Data & Storage.'
        : 'Export your current data first if you might need it.'),
    confirmLabel: 'Replace data',
    onConfirm: () => { void run(); },
  });
}

/** Open a file picker for a JSON export and import it. */
export function pickAndImportBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) void importBackupFile(file);
  };
  input.click();
}
