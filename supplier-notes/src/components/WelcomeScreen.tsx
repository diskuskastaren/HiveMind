import { useState, Fragment } from 'react';
import { useStore } from '../store/store';
import { FileText, FolderOpen, Building2, Sparkles, Mic, CheckSquare, ArrowRight } from 'lucide-react';

const steps = [
  { icon: FolderOpen, title: 'Create a project', sub: 'e.g. "Radius", "Torrent 2"' },
  { icon: Building2, title: 'Add suppliers', sub: 'Luxshare, Sigma, etc.' },
  { icon: FileText, title: 'Take notes', sub: 'Tasks & decisions auto-captured' },
];

const features = [
  { icon: Sparkles, label: 'AI summaries' },
  { icon: Mic, label: 'Meeting transcription' },
  { icon: CheckSquare, label: 'Task & decision tracking' },
];

export function WelcomeScreen() {
  const [projectName, setProjectName] = useState('');
  const addProject = useStore((s) => s.addProject);
  const setActiveProject = useStore((s) => s.setActiveProject);
  const handleCreate = () => {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    const id = addProject(trimmed);
    setActiveProject(id);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 bg-white overflow-auto">
      {/* Brand */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-200">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Combobulator</h1>
        <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
          Capture everything from supplier meetings — tasks, decisions, follow-ups, and transcripts — organised by project and supplier.
        </p>
      </div>

      {/* How it works */}
      <div className="flex items-center gap-3 mb-10">
        {steps.map(({ icon: Icon, title, sub }, i) => (
          <Fragment key={title}>
            <div className="flex flex-col items-center w-36 text-center">
              <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center mb-2">
                <Icon className="w-5 h-5 text-indigo-500" />
              </div>
              <p className="text-sm font-medium text-gray-700">{title}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0 mb-4" />
            )}
          </Fragment>
        ))}
      </div>

      {/* CTA */}
      <div className="w-full max-w-xs mb-8">
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Name your first project…"
            autoFocus
            className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400"
          />
          <button
            onClick={handleCreate}
            disabled={!projectName.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            Create
          </button>
        </div>
      </div>

      {/* Feature pills */}
      <div className="flex gap-6">
        {features.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
