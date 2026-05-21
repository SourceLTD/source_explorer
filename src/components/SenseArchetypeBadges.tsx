'use client';

interface FrameSenseBadgeSource {
  causative?: boolean | null;
  inchoative?: boolean | null;
  perspectival?: boolean | null;
}

const BADGE_DEFINITIONS: Array<{
  key: keyof FrameSenseBadgeSource;
  label: string;
  className: string;
}> = [
  {
    key: 'inchoative',
    label: 'Inchoative',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    key: 'causative',
    label: 'Causative',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  {
    key: 'perspectival',
    label: 'Perspectival',
    className: 'bg-violet-100 text-violet-800 border-violet-200',
  },
];

export function getFrameSenseTypeBadges(sense: FrameSenseBadgeSource) {
  return BADGE_DEFINITIONS.filter(definition => sense[definition.key]);
}

export default function FrameSenseTypeBadges({
  sense,
  className = '',
}: {
  sense: FrameSenseBadgeSource;
  className?: string;
}) {
  const badges = getFrameSenseTypeBadges(sense);
  if (badges.length === 0) return null;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {badges.map(badge => (
        <span
          key={badge.key}
          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </span>
  );
}
