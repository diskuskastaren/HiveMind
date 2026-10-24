import { useEffect } from 'react';
import { toast } from 'sonner';

const TOAST_ID = 'app-update';

/** Listens to electron-updater events and reports them as toasts. Renders nothing. */
export function UpdateDialog() {
  useEffect(() => {
    const updater = (window as any).electronUpdater;
    if (!updater) return;

    // Only surface errors that belong to an update the user has been told about
    let announced = false;

    const onAvailable = (info: { version: string }) => {
      announced = true;
      toast.loading(`Update available — v${info.version}`, {
        id: TOAST_ID,
        description: 'Downloading in the background…',
        duration: Infinity,
        cancel: { label: 'Dismiss', onClick: () => {} },
      });
    };
    const onDownloaded = (info: { version: string }) => {
      announced = true;
      toast.success(`v${info.version} ready to install`, {
        id: TOAST_ID,
        description: 'HiveMind will restart to apply the update.',
        duration: Infinity,
        action: { label: 'Restart & install', onClick: () => (window as any).electronUpdater?.install() },
        cancel: { label: 'Later', onClick: () => {} },
      });
    };
    const onError = (info: { message: string }) => {
      if (!announced) return;
      toast.error('Update check failed', {
        id: TOAST_ID,
        description: info.message || 'An unknown error occurred.',
        duration: 10000,
      });
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

  return null;
}
