'use client';
import { X } from 'lucide-react';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wider dialog for long forms (kitchen editor etc.). */
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={
          'bg-white w-full rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto ' +
          (wide ? 'sm:max-w-2xl' : 'sm:max-w-md')
        }
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-ink" aria-label="close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function IconBtn({
  title,
  onClick,
  tone = 'default',
  children,
}: {
  title: string;
  onClick: () => void;
  tone?: 'default' | 'red' | 'green';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'red'
      ? 'bg-red-50 text-red-600 hover:bg-red-100'
      : tone === 'green'
        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={'w-9 h-9 rounded-lg flex items-center justify-center ' + cls}
    >
      {children}
    </button>
  );
}
