import type { FrameSenseWarning } from '@/lib/types';

interface SenseFrameWarningProps {
  warning: FrameSenseWarning;
  frameCount?: number;
  /** When provided, shown inside the tooltip to explain the anomaly. */
  senseLabel?: string;
  className?: string;
}

/**
 * Small inline badge surfaced next to a frame_sense whose frame cardinality
 * breaks the expected 1:1 invariant. Intended to be unobtrusive — it should
 * not dominate the sense row, just draw attention.
 *
 *   - `'none'`     → sense has no linked frame
 *   - `'multiple'` → sense has more than one linked frame
 */
export function SenseFrameWarning({
  warning,
  frameCount,
  senseLabel,
  className,
}: SenseFrameWarningProps) {
  if (warning === null) return null;

  const title =
    warning === 'none'
      ? `${senseLabel ? `Sense "${senseLabel}" has ` : ''}no frame — expected exactly one.`
      : `${senseLabel ? `Sense "${senseLabel}" has ` : ''}${frameCount ?? 'multiple'} frames — expected exactly one.`;

  const label = warning === 'none' ? 'no frame' : `${frameCount ?? '>1'} frames`;

  return (
    <span
      title={title}
      className={
        'inline-flex items-center gap-1 rounded-sm border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ' +
        (className ?? '')
      }
      role="img"
      aria-label={title}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="h-3 w-3"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      {label}
    </span>
  );
}

export default SenseFrameWarning;
