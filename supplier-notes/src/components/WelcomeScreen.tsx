import { useState } from 'react';
import { useStore } from '../store/store';
import { CheckSquare, FileText, Mic, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { pickAndImportBackup } from '../utils/backup';

const steps = [
  { title: 'Create a project', sub: 'e.g. “Radius” or “Torrent 2”' },
  { title: 'Add suppliers', sub: 'Luxshare, Sigma — whoever you meet' },
  { title: 'Take notes', sub: 'Capture tasks and decisions as you write' },
];

export function WelcomeScreen() {
  const [projectName, setProjectName] = useState('');
  const addProject = useStore((s) => s.addProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const importData = useStore((s) => s.importData);

  const handleCreate = () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    const id = addProject(trimmed);
    setActiveProject(id);
  };

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 overflow-auto bg-sidebar px-6 py-12 text-center">
      <div className="flex max-w-lg flex-col items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <FileText className="size-6" />
        </span>
        <h1 className="text-display font-semibold tracking-tight">Welcome to HiveMind</h1>
        <p className="text-base text-subtle-foreground">
          Capture everything from supplier meetings — tasks, decisions, follow-ups and transcripts — organised by project and supplier.
        </p>
      </div>

      <ol aria-label="How it works" className="flex max-w-3xl flex-wrap justify-center gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-[1_1_200px] flex-col items-start gap-1.5 rounded-xl border bg-card p-4 text-left shadow-xs">
            <span className="font-mono text-2xs font-medium text-primary">{String(i + 1).padStart(2, '0')}</span>
            <span className="text-sm font-semibold">{s.title}</span>
            <span className="text-ui text-muted-foreground">{s.sub}</span>
          </li>
        ))}
      </ol>

      <div className="flex w-full max-w-sm flex-col gap-2.5">
        <Label htmlFor="first-project" className="text-left">
          Name your first project
        </Label>
        <div className="flex gap-2">
          <Input
            id="first-project"
            autoFocus
            value={projectName}
            placeholder="e.g. Radius"
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="h-10"
          />
          <Button size="lg" onClick={handleCreate} disabled={!projectName.trim()}>
            Create project
          </Button>
        </div>
        <Button variant="link" size="sm" className="self-center text-muted-foreground" onClick={() => pickAndImportBackup(importData)}>
          <Upload />
          Restore from a backup instead
        </Button>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ai-soft px-3 text-xs font-medium text-ai">
          <Sparkles className="size-3.5" /> AI summaries
        </span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-recording-soft px-3 text-xs font-medium text-recording">
          <Mic className="size-3.5" /> Meeting transcription
        </span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-medium text-brand-soft-foreground">
          <CheckSquare className="size-3.5" /> Task &amp; decision tracking
        </span>
      </div>
    </main>
  );
}
