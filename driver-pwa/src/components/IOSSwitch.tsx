'use client';

interface Props {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** background color when checked (default: brand gold) */
  onColor?: string;
}

/**
 * iOS-style toggle switch.
 * Aspect ratio ~ 31:51 (real iOS proportions).
 */
export function IOSSwitch({
  checked,
  onChange,
  disabled,
  size = 'lg',
  onColor = 'bg-gold',
}: Props) {
  const dims = {
    sm: { track: 'w-10 h-6', knob: 'w-5 h-5', translate: 'translate-x-4' },
    md: { track: 'w-12 h-7', knob: 'w-6 h-6', translate: 'translate-x-5' },
    lg: { track: 'w-[58px] h-8', knob: 'w-7 h-7', translate: 'translate-x-[26px]' },
  }[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={
        'relative inline-flex items-center rounded-full transition-colors duration-200 disabled:opacity-50 ' +
        dims.track +
        ' ' +
        (checked ? onColor : 'bg-neutral-300') +
        ' shadow-inner'
      }
    >
      <span
        className={
          'absolute left-0.5 inline-block rounded-full bg-white shadow-md shadow-black/20 transition-transform duration-200 ease-out ' +
          dims.knob +
          ' ' +
          (checked ? dims.translate : 'translate-x-0')
        }
      />
    </button>
  );
}
