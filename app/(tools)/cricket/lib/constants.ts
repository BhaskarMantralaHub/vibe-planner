export const TEAM_NAME = 'Sunrisers Manteca';

export type CategoryConfig = {
  key: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
};

export const EXPENSE_CATEGORIES: CategoryConfig[] = [
  { key: 'ground', label: 'Jerseys', icon: '👕', color: '#16A34A', bgColor: '#DCFCE7', borderColor: '#16A34A' },
  { key: 'equipment', label: 'Cricket Kit', icon: '🏏', color: '#3B82F6', bgColor: '#DBEAFE', borderColor: '#3B82F6' },
  { key: 'tournament', label: 'Tournament', icon: '🏆', color: '#F59E0B', bgColor: '#FEF3C7', borderColor: '#F59E0B' },
  { key: 'food', label: 'Food & Drinks', icon: '🍕', color: '#EF4444', bgColor: '#FEF2F2', borderColor: '#EF4444' },
  { key: 'other', label: 'Other', icon: '📦', color: '#6B7280', bgColor: '#F3F4F6', borderColor: '#6B7280' },
];

export const PLAYER_ROLES = [
  { key: 'batsman', label: 'Batsman', icon: '🏏' },
  { key: 'bowler', label: 'Bowler', icon: '🎯' },
  { key: 'all-rounder', label: 'All-Rounder', icon: '⭐' },
  { key: 'keeper', label: 'Wicket Keeper', icon: '🧤' },
] as const;

export const BATTING_STYLES = [
  { key: 'right', label: 'Right Hand' },
  { key: 'left', label: 'Left Hand' },
] as const;

export const BOWLING_STYLES = [
  { key: 'pace', label: 'Pace' },
  { key: 'medium', label: 'Medium' },
  { key: 'spin', label: 'Spin' },
] as const;

export const SHIRT_SIZES = [
  { key: 'XS', label: 'XS', color: '#06B6D4' },
  { key: 'S', label: 'S', color: '#3B82F6' },
  { key: 'M', label: 'M', color: '#F59E0B' },
  { key: 'L', label: 'L', color: '#16A34A' },
  { key: 'XL', label: 'XL', color: '#D97706' },
  { key: 'XXL', label: 'XXL', color: '#EF4444' },
] as const;

export const SEASON_TYPES = [
  { key: 'spring', label: 'Spring' },
  { key: 'summer', label: 'Summer' },
  { key: 'fall', label: 'Fall' },
] as const;

export function getCategoryConfig(key: string): CategoryConfig {
  return EXPENSE_CATEGORIES.find((c) => c.key === key) ?? EXPENSE_CATEGORIES[4];
}
