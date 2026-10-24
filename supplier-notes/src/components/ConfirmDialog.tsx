import { useStore } from '../store/store';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

export function ConfirmDialog() {
  const dialog = useStore((s) => s.confirmDialog);
  const closeConfirmDialog = useStore((s) => s.closeConfirmDialog);

  const isDanger = dialog?.variant !== 'default';
  const confirmLabel = dialog?.confirmLabel ?? (isDanger ? 'Delete' : 'Confirm');

  return (
    <AlertDialog open={!!dialog} onOpenChange={(open) => !open && closeConfirmDialog()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{dialog?.title ?? (isDanger ? 'Are you sure?' : 'Confirm')}</AlertDialogTitle>
          <AlertDialogDescription>{dialog?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            autoFocus
            className={isDanger ? buttonVariants({ variant: 'destructive' }) : undefined}
            onClick={() => {
              dialog?.onConfirm();
              closeConfirmDialog();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
