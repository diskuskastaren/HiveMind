import { toast } from 'sonner';
import type { ExportData } from '../store/store';

/** Read a JSON backup file and hand it to the store's importData. */
export function importBackupFile(file: File, importData: (data: ExportData) => void) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target?.result as string);
      importData(data);
      toast.success('Backup restored', { description: file.name });
    } catch {
      toast.error('Invalid backup file', { description: 'Please select a valid Combobulator backup JSON.' });
    }
  };
  reader.readAsText(file);
}

/** Open a file picker for a JSON backup and import it. */
export function pickAndImportBackup(importData: (data: ExportData) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) importBackupFile(file, importData);
  };
  input.click();
}
