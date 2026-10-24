import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function RecoveryScreen({ error }: { error: string }) {
  const [backups, setBackups] = useState<Array<{ id: string; createdAt: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const api = (window as any).electronStore;
  useEffect(() => { api?.backups?.().then((items: typeof backups) => setBackups(items.sort((a, b) => b.createdAt - a.createdAt))).catch((cause: Error) => setRestoreError(cause.message)); }, []);
  const restore = async (id: string) => {
    setBusy(true); setRestoreError('');
    try { await api.restore(id); }
    catch (cause) { setRestoreError(cause instanceof Error ? cause.message : String(cause)); setBusy(false); }
  };
  return <main className="flex h-full items-center justify-center bg-background p-6 text-foreground">
    <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Data recovery</h1>
      <p className="text-sm text-muted-foreground">HiveMind could not safely read the data file. Saving is paused to protect the existing data.</p>
      <p className="rounded-md bg-warning-soft p-3 text-xs text-warning">{error}</p>
      <h2 className="text-sm font-semibold">Available backups</h2>
      {backups.length === 0 && <p className="text-sm text-muted-foreground">No automatic backups were found. Open the data folder to recover the file manually.</p>}
      <div className="max-h-64 overflow-y-auto">{backups.map((item) => <div key={item.id} className="flex items-center justify-between border-b py-2 text-sm"><span>{new Date(item.createdAt).toLocaleString()}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => restore(item.id)}>Restore</Button></div>)}</div>
      {restoreError && <p role="alert" className="text-xs text-destructive">{restoreError}</p>}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => api?.openFolder?.()}>Open data folder</Button>
    </div>
  </main>;
}
