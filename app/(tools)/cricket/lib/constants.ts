export const TEAM_NAME = 'Sunrisers Manteca';

export type CategoryConfig = {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

export const EXPENSE_CATEGORIES: CategoryConfig[] = [
  { key: 'ground', label: 'Ground', color: '#16A34A', bgColor: '#DCFCE7', borderColor: '#16A34A' },
  { key: 'equipment', label: 'Equipment', color: '#3B82F6', bgColor: '#DBEAFE', borderColor: '#3B82F6' },
  { key: 'tournament', label: 'Tournament', color: '#F59E0B', bgColor: '#FEF3C7', borderColor: '#F59E0B' },
  { key: 'food', label: 'Food & Drinks', color: '#EF4444', bgColor: '#FEF2F2', borderColor: '#EF4444' },
  { key: 'other', label: 'Other', color: '#8B5CF6', bgColor: '#EDE9FE', borderColor: '#8B5CF6' },
];

export const SEASON_TYPES = [
  { key: 'spring', label: 'Spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'fall', label: 'Fall' },
] as const;

export function getCategoryConfig(key: string): CategoryConfig {
  return EXPENSE_CATEGORIES.find((c) => c.key === key) ?? EXPENSE_CATEGORIES[4];
}
