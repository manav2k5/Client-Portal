import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export default function Modal({ children, onClose, title }: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return <dialog ref={ref} className="native-modal" aria-labelledby={title} onCancel={onClose}>{children}</dialog>;
}
