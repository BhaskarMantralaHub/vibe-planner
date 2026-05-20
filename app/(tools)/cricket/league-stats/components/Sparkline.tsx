import type { JSX } from "react";

export type SparklineProps = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  showLastDot?: boolean;
  ariaLabel?: string;
  /** Animate the line drawing on mount (default true). The line "writes itself"
   *  using stroke-dasharray; reduced-motion users get the line instantly. */
  animate?: boolean;
};

export default function Sparkline({
  data,
  width = 64,
  height = 24,
  color = "currentColor",
  fillOpacity = 0.18,
  showLastDot = true,
  ariaLabel,
  animate = true,
}: SparklineProps): JSX.Element {
  const label = ariaLabel ?? `Trend: ${data.join(", ")}`;
  const pad = 1; // leave 1px so 2px stroke doesn't clip top/bottom
  const w = width;
  const h = height;
  const viewBox = `0 0 ${w} ${h}`;

  // Edge case: empty array — render bare svg, no path/dot
  if (data.length === 0) {
    return (
      <svg role="img" aria-label={label} width={w} height={h} viewBox={viewBox} preserveAspectRatio="none" />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const yFor = (v: number) => {
    // Edge case: all values equal — pin to vertical center for a flat line
    if (range === 0) return h / 2;
    return h - pad - ((v - min) / range) * (h - pad * 2);
  };
  const xFor = (i: number) => {
    // Edge case: single point — place it at horizontal center as a lone dot
    if (data.length === 1) return w / 2;
    return (i / (data.length - 1)) * w;
  };

  const points = data.map((v, i) => [xFor(i), yFor(v)] as const);
  const lastX = points[points.length - 1][0];
  const lastY = points[points.length - 1][1];

  // Edge case: single point — just a dot, no line/area
  if (data.length === 1) {
    return (
      <svg role="img" aria-label={label} width={w} height={h} viewBox={viewBox} preserveAspectRatio="none">
        <circle cx={lastX} cy={lastY} r={2} fill={color} />
      </svg>
    );
  }

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${lastX.toFixed(2)} ${h} L${points[0][0].toFixed(2)} ${h} Z`;

  return (
    <svg role="img" aria-label={label} width={w} height={h} viewBox={viewBox} preserveAspectRatio="none">
      {fillOpacity > 0 && <path d={areaPath} fill={color} fillOpacity={fillOpacity} stroke="none" />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className={animate ? "sparkline-draw" : undefined}
      />
      {showLastDot && <circle cx={lastX} cy={lastY} r={2} fill={color} />}
    </svg>
  );
}
