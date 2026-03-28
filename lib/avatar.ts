/** Deterministic avatar gradient from player name */
const avatarGradients: [string, string][] = [
  ['#4DBBEB', '#5B9BD5'],  // sky blue
  ['#6366F1', '#818CF8'],  // indigo
  ['#8B5CF6', '#A78BFA'],  // purple
  ['#EC4899', '#F472B6'],  // pink
  ['#F59E0B', '#FBBF24'],  // amber
  ['#10B981', '#34D399'],  // emerald
  ['#EF4444', '#F87171'],  // red
  ['#14B8A6', '#2DD4BF'],  // teal
];

export function nameToGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarGradients[Math.abs(hash) % avatarGradients.length];
}
