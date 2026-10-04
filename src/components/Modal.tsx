import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Icon } from './Icon';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  size?: 'sm' | 'md' | 'lg';
}

/** Nativní <dialog> — zajišťuje zachycení fokusu, Esc i přístupnost. */
export function Modal({ title, onClose, children, size = 'sm' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  const width = size === 'lg' ? 'max-w-2xl' : size === 'md' ? 'max-w-lg' : 'max-w-sm';

  return (
    <dialog
      ref={ref}
      aria-label={title}
      class={`m-auto w-[calc(100%-2rem)] ${width} rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Klik na pozadí (mimo obsah) dialog zavře.
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <h2 class="text-sm font-semibold">{title}</h2>
        <button type="button" class="btn-icon" onClick={onClose} aria-label="Zavřít">
          <Icon name="x" />
        </button>
      </div>
      <div class="max-h-[75vh] overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
