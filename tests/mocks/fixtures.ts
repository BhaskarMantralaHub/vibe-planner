import type {
  CricketPlayer, CricketSeason, CricketExpense, CricketExpenseSplit,
  CricketSettlement, CricketSeasonFee, CricketSponsorship,
  GalleryPost, GalleryTag, GalleryComment, GalleryLike, CommentReaction, GalleryNotification,
} from '@/types/cricket';

/* ── Users ── */
export const ADMIN_USER = {
  id: 'admin-uid-001',
  email: 'admin@example.com',
  user_metadata: { full_name: 'Super Admin' },
};

export const PLAYER_USER_1 = {
  id: 'player-uid-001',
  email: 'bhaskar@example.com',
  user_metadata: { full_name: 'Bhaskar Bachi' },
};

export const PLAYER_USER_2 = {
  id: 'player-uid-002',
  email: 'mani@example.com',
  user_metadata: { full_name: 'Manigopal' },
};

export const TOOLKIT_USER = {
  id: 'toolkit-uid-001',
  email: 'toolkit@example.com',
  user_metadata: { full_name: 'Toolkit User' },
};

/* ── Players ── */
export const PLAYERS: CricketPlayer[] = [
  {
    id: 'p1', user_id: PLAYER_USER_1.id, name: 'Bhaskar Bachi',
    jersey_number: 7, phone: '555-0001', player_role: 'batsman',
    batting_style: 'right', bowling_style: '', cricclub_id: null,
    shirt_size: 'L', email: 'bhaskar@example.com', designation: 'captain',
    photo_url: null, is_active: true, is_guest: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p2', user_id: PLAYER_USER_2.id, name: 'Manigopal',
    jersey_number: 11, phone: '555-0002', player_role: 'all-rounder',
    batting_style: 'right', bowling_style: 'medium', cricclub_id: null,
    shirt_size: 'M', email: 'mani@example.com', designation: null,
    photo_url: 'https://example.com/mani.jpg', is_active: true, is_guest: false,
    created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
  },
  {
    id: 'p3', user_id: ADMIN_USER.id, name: 'Inactive Player',
    jersey_number: 99, phone: null, player_role: 'bowler',
    batting_style: null, bowling_style: 'pace', cricclub_id: null,
    shirt_size: null, email: 'inactive@example.com', designation: null,
    photo_url: null, is_active: false, is_guest: false, created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
  },
];

/* ── Seasons ── */
export const SEASONS: CricketSeason[] = [
  {
    id: 'season-spring-2026', user_id: ADMIN_USER.id, name: 'Spring 2026',
    year: 2026, season_type: 'spring', share_token: 'share-token-1',
    fee_amount: 60, is_active: true, created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'season-fall-2025', user_id: ADMIN_USER.id, name: 'Fall 2025',
    year: 2025, season_type: 'fall', share_token: 'share-token-2',
    fee_amount: 50, is_active: true, created_at: '2025-09-01T00:00:00Z', updated_at: '2025-09-01T00:00:00Z',
  },
];

/* ── Expenses ── */
export const EXPENSES: CricketExpense[] = [
  {
    id: 'exp-1', user_id: ADMIN_USER.id, season_id: 'season-spring-2026',
    paid_by: 'p1', category: 'ground', description: 'Ground rental March',
    amount: 200, expense_date: '2026-03-15', receipt_urls: null, created_by: 'Bhaskar Bachi',
    updated_by: null, deleted_at: null, deleted_by: null,
    created_at: '2026-03-15T00:00:00Z', updated_at: '2026-03-15T00:00:00Z',
  },
  {
    id: 'exp-2', user_id: ADMIN_USER.id, season_id: 'season-spring-2026',
    paid_by: 'p1', category: 'equipment', description: 'Cricket balls',
    amount: 50, expense_date: '2026-03-10', receipt_urls: null, created_by: 'Bhaskar Bachi',
    updated_by: null, deleted_at: '2026-03-20T00:00:00Z', deleted_by: 'Bhaskar Bachi',
    created_at: '2026-03-10T00:00:00Z', updated_at: '2026-03-20T00:00:00Z',
  },
];

/* ── Splits ── */
export const SPLITS: CricketExpenseSplit[] = [
  { id: 'split-1', expense_id: 'exp-1', player_id: 'p1', share_amount: 100 },
  { id: 'split-2', expense_id: 'exp-1', player_id: 'p2', share_amount: 100 },
];

/* ── Settlements ── */
export const SETTLEMENTS: CricketSettlement[] = [
  {
    id: 'settle-1', user_id: ADMIN_USER.id, season_id: 'season-spring-2026',
    from_player: 'p2', to_player: 'p1', amount: 50, settled_date: '2026-03-16',
    created_at: '2026-03-16T00:00:00Z',
  },
];

/* ── Fees ── */
export const FEES: CricketSeasonFee[] = [
  {
    id: 'fee-1', season_id: 'season-spring-2026', player_id: 'p1',
    amount_paid: 60, paid_date: '2026-03-01', marked_by: 'Bhaskar Bachi',
    created_at: '2026-03-01T00:00:00Z',
  },
];

/* ── Sponsorships ── */
export const SPONSORSHIPS: CricketSponsorship[] = [
  {
    id: 'sponsor-1', season_id: 'season-spring-2026', sponsor_name: 'Local Business',
    amount: 500, sponsored_date: '2026-03-01', notes: 'Jersey sponsor',
    created_by: 'Bhaskar Bachi', updated_by: null, deleted_at: null, deleted_by: null,
    created_at: '2026-03-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  },
];

/* ── Gallery Posts ── */
export const GALLERY_POSTS: GalleryPost[] = [
  {
    id: 'post-1', season_id: 'season-spring-2026', user_id: PLAYER_USER_1.id,
    photo_url: 'https://example.com/match1.jpg', photo_urls: null,
    caption: 'Great match today! @Manigopal @Everyone #MatchDay',
    posted_by: 'Bhaskar Bachi', deleted_at: null,
    created_at: '2026-03-20T10:00:00Z',
  },
  {
    id: 'post-2', season_id: 'season-spring-2026', user_id: PLAYER_USER_2.id,
    photo_url: 'https://example.com/practice.jpg', photo_urls: null,
    caption: 'Practice session', posted_by: 'Manigopal', deleted_at: null,
    created_at: '2026-03-19T10:00:00Z',
  },
  {
    id: 'post-welcome', season_id: 'season-spring-2026', user_id: ADMIN_USER.id,
    photo_url: null, photo_urls: null,
    caption: 'Welcome to the squad, Vikram! @Vikram @Everyone',
    posted_by: 'Sunrisers Manteca', deleted_at: null,
    created_at: '2026-03-21T10:00:00Z',
  },
  {
    id: 'post-deleted', season_id: 'season-spring-2026', user_id: PLAYER_USER_1.id,
    photo_url: 'https://example.com/old.jpg', photo_urls: null,
    caption: 'Old post', posted_by: 'Bhaskar Bachi',
    deleted_at: '2026-03-21T00:00:00Z',
    created_at: '2026-03-18T10:00:00Z',
  },
];

/* ── Gallery Tags ── */
export const GALLERY_TAGS: GalleryTag[] = [
  { id: 'tag-1', post_id: 'post-1', player_id: 'p2' },
];

/* ── Gallery Comments ── */
export const GALLERY_COMMENTS: GalleryComment[] = [
  {
    id: 'comment-1', post_id: 'post-1', user_id: PLAYER_USER_2.id,
    comment_by: 'Manigopal', text: 'What a match!',
    created_at: '2026-03-20T11:00:00Z',
  },
  {
    id: 'comment-2', post_id: 'post-1', user_id: PLAYER_USER_1.id,
    comment_by: 'Bhaskar Bachi', text: 'Thanks team!',
    created_at: '2026-03-20T12:00:00Z',
  },
];

/* ── Gallery Likes ── */
export const GALLERY_LIKES: GalleryLike[] = [
  { id: 'like-1', post_id: 'post-1', user_id: PLAYER_USER_2.id, liked_by: 'Manigopal' },
  { id: 'like-2', post_id: 'post-1', user_id: PLAYER_USER_1.id, liked_by: 'Bhaskar Bachi' },
];

/* ── Comment Reactions ── */
export const COMMENT_REACTIONS: CommentReaction[] = [
  { id: 'reaction-1', comment_id: 'comment-1', user_id: PLAYER_USER_1.id, emoji: '👍' },
];

/* ── Notifications ── */
export const NOTIFICATIONS: GalleryNotification[] = [
  {
    id: 'notif-1', user_id: PLAYER_USER_1.id, post_id: 'post-2',
    type: 'like', message: 'Manigopal liked your photo',
    is_read: false, created_at: '2026-03-20T15:00:00Z',
  },
  {
    id: 'notif-2', user_id: PLAYER_USER_1.id, post_id: 'post-1',
    type: 'tag', message: 'Vikram joined the team!',
    is_read: true, created_at: '2026-03-21T10:00:00Z',
  },
];

/* ── Profiles (for auth tests) ── */
export const PROFILES = {
  admin: { id: ADMIN_USER.id, email: ADMIN_USER.email, disabled: false, access: ['toolkit', 'admin'], approved: true },
  player1: { id: PLAYER_USER_1.id, email: PLAYER_USER_1.email, disabled: false, access: ['cricket', 'admin'], approved: true },
  player2: { id: PLAYER_USER_2.id, email: PLAYER_USER_2.email, disabled: false, access: ['cricket'], approved: true },
  toolkit: { id: TOOLKIT_USER.id, email: TOOLKIT_USER.email, disabled: false, access: ['toolkit'], approved: true },
  pending: { id: 'pending-uid-001', email: 'pending@example.com', disabled: false, access: ['cricket'], approved: false },
  disabled: { id: 'disabled-uid-001', email: 'disabled@example.com', disabled: true, access: ['cricket'], approved: true },
};
