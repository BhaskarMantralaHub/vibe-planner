export default function BowlerIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
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
    >
      {/* Head */}
      <circle cx="12" cy="4" r="2" />

      {/* Body */}
      <path d="M12 6v6" />

      {/* Bowling arm (raised) */}
      <path d="M12 7l4-2" />

      {/* Ball */}
      <circle cx="17" cy="5" r="1" />

      {/* Front arm */}
      <path d="M12 8l-3 2" />

      {/* Legs (bowling action) */}
      <path d="M12 12l-2 5" />
      <path d="M12 12l3 5" />
    </svg>
  );
}
