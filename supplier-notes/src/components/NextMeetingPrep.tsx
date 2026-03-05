import { useStore } from '../store/store';
import { format } from 'date-fns';
import { X, Copy, CheckCircle2, Lightbulb, FileText } from 'lucide-react';

export function NextMeetingPrep() {
  const supplierId = useStore((s) => s.nextMeetingPrepSupplierId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const supplier = useStore((s) => s.suppliers.find((x) => x.id === s.nextMeetingPrepSupplierId));
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const tasks = useStore((s) => s.tasks.filter((t) => t.supplierId === supplierId && t.projectId === activeProjectId && t.status !== 'done'));
  const decisions = useStore((s) =>
    s.decisions
      .filter((d) => d.supplierId === supplierId && d.projectId === activeProjectId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10),
  );
  const notes = useStore((s) =>
    s.notes
      .filter((n) => supplierId && n.supplierIds.includes(supplierId) && activeProjectId && n.projectIds.includes(activeProjectId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3),
  );
  const close = useStore((s) => () => s.setNextMeetingPrepSupplier(null));

  if (!supplierId || !supplier) return null;

  const buildAgenda = (): string => {
    let text = `Next Meeting Prep — ${supplier.name}`;
    if (project) text += ` (${project.name})`;
    text += '\n';
    text += `Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}\n`;
    text += '='.repeat(50) + '\n\n';

    if (tasks.length) {
      text += 'OPEN ACTION ITEMS\n';
      tasks.forEach((t, i) => {
        const owner = t.owner ? ` [${t.owner}]` : '';
        const due = t.dueDate ? ` (due ${t.dueDate})` : '';
        text += `  ${i + 1}. ${t.title}${owner}${due} — ${t.status}\n`;
      });
      text += '\n';
    }

    if (decisions.length) {
      text += 'RECENT DECISIONS\n';
      decisions.forEach((d, i) => {
        text += `  ${i + 1}. ${d.text} (${format(new Date(d.createdAt), 'MMM d')})\n`;
      });
      text += '\n';
    }

    text += 'AGENDA ITEMS\n';
    text += '  1. Review open action items\n';
    text += '  2. \n';
    text += '  3. \n\n';

    return text;
  };

  const copyAgenda = async () => {
    await navigator.clipboard.writeText(buildAgenda());
    alert('Agenda copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={close} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold dark:text-gray-100">Next Meeting Prep</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: supplier.color }} />
              <span className="text-sm text-gray-500 dark:text-gray-400">{supplier.name}</span>
              {project && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: project.color + '20', color: project.color }}
                >
                  {project.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyAgenda}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" /> Copy as agenda
            </button>
            <button onClick={close} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <X className="w-4 h-4 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Open tasks */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-blue-500" /> Open Action Items
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({tasks.length})</span>
            </h3>
            {tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <span
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        t.priority === 'high' ? 'bg-red-500' : t.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                      }`}
                    />
                    <div className="flex-1">
                      <div className="text-sm dark:text-gray-300">{t.title}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {t.owner && `@${t.owner}`}
                        {t.owner && t.dueDate && ' · '}
                        {t.dueDate && `due ${t.dueDate}`}
                        {!t.owner && !t.dueDate && t.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">No open action items.</p>
            )}
          </section>

          {/* Recent decisions */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
              <Lightbulb className="w-4 h-4 text-green-500" /> Recent Decisions
              <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({decisions.length})</span>
            </h3>
            {decisions.length > 0 ? (
              <div className="space-y-2">
                {decisions.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Lightbulb className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm dark:text-gray-300">{d.text}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {format(new Date(d.createdAt), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">No decisions recorded yet.</p>
            )}
          </section>

          {/* Recent notes */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" /> Recent Notes
            </h3>
            {notes.length > 0 ? (
              <div className="space-y-2">
                {notes.map((n) => (
                  <div key={n.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm font-medium dark:text-gray-300">{n.title || 'Untitled'}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {format(new Date(n.updatedAt), 'MMM d, yyyy')}
                      {n.attendees && ` · ${n.attendees}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">No notes yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
