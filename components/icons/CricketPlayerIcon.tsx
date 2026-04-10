export default function CricketPlayerIcon({
  size = 20,
  color = "currentColor",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke="none"
      className={className}
    >
      {/* Batsman silhouette — drive shot stance */}
      {/* Helmet */}
      <circle cx="10.5" cy="3.2" r="2.2" />
      {/* Visor */}
      <rect x="8.8" y="3.8" width="3.4" height="0.7" rx="0.3" />

      {/* Torso */}
      <path d="M9 5.5L8 12h5l-1-6.5z" />

      {/* Front arm + hands gripping bat */}
      <path d="M9 6.5L6.5 5L6 5.8L8.5 7.5z" />
      <path d="M9.5 7L7 5.5L6.5 6.3L9 8z" />

      {/* Bat — angled up */}
      <path d="M6.2 5.5L3 1.5L4 0.8L7 4.8z" />

      {/* Front leg — bent, stepping forward */}
      <path d="M9.5 12L7 18.5L8.5 19L10.5 12.5z" />
      {/* Front pad */}
      <rect x="7" y="15.5" width="1.8" height="3.5" rx="0.5" />
      {/* Front foot */}
      <ellipse cx="7.2" cy="19.2" rx="1.5" ry="0.6" />

      {/* Back leg — extended */}
      <path d="M11.5 12L14 18L15.5 17.3L12.5 11.5z" />
      {/* Back pad */}
      <rect x="13.5" y="15" width="1.5" height="3" rx="0.5" />
      {/* Back foot */}
      <ellipse cx="15" cy="18.2" rx="1.5" ry="0.6" />
    </svg>
  );
}
