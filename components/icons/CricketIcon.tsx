export default function CricketIcon({
  size = 20,
  color = "currentColor",
  strokeWidth = 1.8,
  className,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Stumps — three vertical lines */}
      <line x1="8" y1="4" x2="8" y2="18" />
      <line x1="11" y1="4" x2="11" y2="18" />
      <line x1="14" y1="4" x2="14" y2="18" />

      {/* Bails */}
      <line x1="7.5" y1="4" x2="11" y2="4" />
      <line x1="11" y1="4" x2="14.5" y2="4" />

      {/* Bat blade — straight diagonal */}
      <line x1="13" y1="8" x2="20" y2="21" />
      <line x1="15" y1="7" x2="22" y2="20" />
      <line x1="13" y1="8" x2="15" y2="7" />
      <line x1="20" y1="21" x2="22" y2="20" />

      {/* Bat handle — straight, same angle as blade */}
      <line x1="14" y1="7.5" x2="12.5" y2="4.5" />

      {/* Ball */}
      <circle cx="4.5" cy="9" r="2.5" />
      <path d="M3 7.5c1 1 2 2 3 3" />
    </svg>
  );
}
