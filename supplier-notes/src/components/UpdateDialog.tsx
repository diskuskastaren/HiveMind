import { useEffect, useState } from 'react';
import { Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

interface UpdateState {
  status: UpdateStatus;
  version: string;
  error: string;
}

export function UpdateDialog() {
  const [state, setState] = useState<UpdateState>({ status: 'idle', version: '', error: '' });

  useEffect(() => {
    const updater = (window as any).electronUpdater;
    if (!updater) return;

    const onAvailable = (info: { version: string }) => {
      setState({ status: 'available', version: info.version, error: '' });
    };
    const onDownloaded = (info: { version: string }) => {
      setState({ status: 'downloaded', version: info.version, error: '' });
    };
    const onError = (info: { message: string }) => {
      setState((s) => s.status === 'idle' ? s : { status: 'error', version: '', error: info.message });
    };

    updater.onUpdateAvailable(onAvailable);
    updater.onUpdateDownloaded(onDownloaded);
    updater.onError(onError);

    return () => {
      updater.offUpdateAvailable(onAvailable);
      updater.offUpdateDownloaded(onDownloaded);
      updater.offError(onError);
    };
  }, []);

  if (state.status === 'idle') return null;

  const handleInstall = () => {
    (window as any).electronUpdater?.install();
  };

  const handleDismiss = () => {
    setState({ status: 'idle', version: '', error: '' });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/20" onClick={state.status === 'downloaded' ? undefined : handleDismiss} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-sm p-5">

        {state.status === 'available' && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Update available — v{state.version}
              </p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 ml-11">
              Downloading in the background…
            </p>
            <div className="mt-4 ml-11">
              <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </>
        )}

        {state.status === 'downloaded' && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                v{state.version} ready to install
              </p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 ml-11">
              Combobulator will restart to apply the update.
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Later
              </button>
              <button
                autoFocus
                onClick={handleInstall}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restart &amp; Install
              </button>
            </div>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Update check failed</p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 ml-11 break-words">
              {state.error || 'An unknown error occurred.'}
            </p>
            <div className="flex justify-end mt-4">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
