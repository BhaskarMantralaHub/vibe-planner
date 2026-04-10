export default function UmpireIcon({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
    >
      {/* Hat */}
      <rect x="16" y="8" width="32" height="10" rx="4" fill="#D9D9D9" />
      <rect x="10" y="16" width="44" height="4" rx="2" fill="#D9D9D9" />
      <circle cx="32" cy="18" r="1.5" fill="#000" />

      {/* Face */}
      <ellipse cx="32" cy="30" rx="10" ry="12" fill="#E8A87C" />

      {/* Body */}
      <path
        d="M12 56C12 46 20 40 32 40C44 40 52 46 52 56"
        fill="#D9D9D9"
      />

      {/* Shirt / Tie */}
      <polygon points="28,40 36,40 32,48" fill="#FF6B6B" />
    </svg>
  );
}
