import { useEffect } from 'react';
import { useStore } from '../store/store';

export function ConfirmDialog() {
  const dialog = useStore((s) => s.confirmDialog);
  const closeConfirmDialog = useStore((s) => s.closeConfirmDialog);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirmDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, closeConfirmDialog]);

  if (!dialog) return null;

  const isDanger = dialog.variant !== 'default';
  const confirmLabel = dialog.confirmLabel ?? (isDanger ? 'Delete' : 'Confirm');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/20" onClick={closeConfirmDialog} />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-xs p-5">
        {dialog.title && (
          <p className="text-sm font-semibold text-gray-900 mb-1">{dialog.title}</p>
        )}
        <p className="text-sm text-gray-500">{dialog.message}</p>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={closeConfirmDialog}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={() => {
              dialog.onConfirm();
              closeConfirmDialog();
            }}
            className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors ${
              isDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
