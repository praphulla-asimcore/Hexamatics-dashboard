interface Props {
  className?: string
}

export function HexaLogo({ className = 'h-8' }: Props) {
  return (
    <svg
      viewBox="0 0 260 72"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="HEXA"
      style={{ filter: 'drop-shadow(0 1px 2px rgba(139,24,232,0.15))' }}
    >
      <defs>
        <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#E8177A" />
          <stop offset="48%"  stopColor="#8B18E8" />
          <stop offset="100%" stopColor="#1B1BE8" />
        </linearGradient>
      </defs>

      {/* H */}
      <rect x="2"  y="6"  width="11" height="60" rx="2" fill="url(#hg)" />
      <rect x="2"  y="6"  width="11" height="23" rx="2" fill="url(#hg)" />
      <rect x="2"  y="43" width="11" height="23" rx="2" fill="url(#hg)" />
      <rect x="43" y="6"  width="11" height="60" rx="2" fill="url(#hg)" />
      <rect x="2"  y="27" width="52" height="12" rx="2" fill="url(#hg)" />

      {/* E */}
      <rect x="62" y="6"  width="11" height="60" rx="2" fill="url(#hg)" />
      <rect x="62" y="6"  width="44" height="11" rx="2" fill="url(#hg)" />
      <rect x="62" y="27" width="38" height="11" rx="2" fill="url(#hg)" />
      <rect x="62" y="55" width="44" height="11" rx="2" fill="url(#hg)" />

      {/* X */}
      <path d="M116 6 L138 36 L116 66 L128 66 L146 38 L164 66 L176 66 L154 36 L176 6 L164 6 L146 34 L128 6 Z" fill="url(#hg)" />

      {/* A */}
      <path d="M192 66 L210 6 L228 6 L246 66 L234 66 L220 18 L206 66 Z" fill="url(#hg)" />
      <rect x="203" y="42" width="34" height="11" rx="2" fill="url(#hg)" />

      {/* TM */}
      <text x="249" y="16" fontFamily="Arial, sans-serif" fontSize="10" fill="url(#hg)">™</text>
    </svg>
  )
}
