export type VibeStatus = 'spark' | 'in_progress' | 'scheduled' | 'done';

export type VibeCategory = 'Work' | 'Personal' | 'Creative' | 'Learning' | 'Health';

export type Vibe = {
  id: string;
  user_id: string;
  text: string;
  status: VibeStatus;
  category: VibeCategory | null;
  time_spent: number;
  notes: string;
  due_date: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StatusConfig = {
  label: string;
  icon: string;
  color: string;
  gradient: string;
  glow: string;
};
