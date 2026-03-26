import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => null,
  isCloudMode: () => false,
}));

// Must import after mock declaration
import { useCricketStore } from '@/stores/cricket-store';
import {
  PLAYERS, SEASONS,
  GALLERY_POSTS, GALLERY_TAGS, GALLERY_COMMENTS,
  GALLERY_LIKES, COMMENT_REACTIONS, NOTIFICATIONS,
  PLAYER_USER_1, PLAYER_USER_2, ADMIN_USER,
} from '@/tests/mocks/fixtures';

function getState() {
  return useCricketStore.getState();
}

beforeEach(() => {
  useCricketStore.setState({
    players: [...PLAYERS],
    seasons: [...SEASONS],
    expenses: [],
    splits: [],
    settlements: [],
    fees: [],
    sponsorships: [],
    gallery: [...GALLERY_POSTS],
    galleryTags: [...GALLERY_TAGS],
    galleryComments: [...GALLERY_COMMENTS],
    galleryLikes: [...GALLERY_LIKES],
    commentReactions: [...COMMENT_REACTIONS],
    notifications: [...NOTIFICATIONS],
    selectedSeasonId: 'season-spring-2026',
    loading: false,
    loadingMoreGallery: false,
    hasMoreGallery: false,
    galleryOffset: 0,
    showPlayerForm: false,
    showExpenseForm: false,
    showSettleForm: false,
    editingPlayer: null,
  });
});

// ── Gallery Posts ────────────────────────────────────────────────────────────

describe('addGalleryPost', () => {
  it('creates a post with correct fields and prepends to the array', () => {
    const before = getState().gallery.length;

    getState().addGalleryPost(
      PLAYER_USER_1.id,
      'season-spring-2026',
      ['https://example.com/new-photo.jpg'],
      'Test caption',
      'Bhaskar Bachi',
      [],
    );

    const { gallery } = getState();
    expect(gallery).toHaveLength(before + 1);

    const newPost = gallery[0];
    expect(newPost.user_id).toBe(PLAYER_USER_1.id);
    expect(newPost.season_id).toBe('season-spring-2026');
    expect(newPost.photo_url).toBe('https://example.com/new-photo.jpg');
    expect(newPost.photo_urls).toEqual(['https://example.com/new-photo.jpg']);
    expect(newPost.caption).toBe('Test caption');
    expect(newPost.posted_by).toBe('Bhaskar Bachi');
    expect(newPost.deleted_at).toBeNull();
    expect(newPost.created_at).toBeTruthy();
    expect(newPost.id).toBeTruthy();
  });

  it('creates gallery tags for tagged players', () => {
    const tagsBefore = getState().galleryTags.length;

    getState().addGalleryPost(
      PLAYER_USER_1.id,
      'season-spring-2026',
      ['https://example.com/tagged.jpg'],
      'Tagged photo',
      'Bhaskar Bachi',
      ['p1', 'p2'],
    );

    const { galleryTags, gallery } = getState();
    expect(galleryTags).toHaveLength(tagsBefore + 2);

    const newPostId = gallery[0].id;
    const newTags = galleryTags.filter((t) => t.post_id === newPostId);
    expect(newTags).toHaveLength(2);
    expect(newTags.map((t) => t.player_id).sort()).toEqual(['p1', 'p2']);
  });

  it('handles null caption and null postedBy', () => {
    getState().addGalleryPost(
      PLAYER_USER_1.id,
      'season-spring-2026',
      ['https://example.com/no-caption.jpg'],
      null,
      null,
      [],
    );

    const newPost = getState().gallery[0];
    expect(newPost.caption).toBeNull();
    expect(newPost.posted_by).toBeNull();
  });
});

// ── updateGalleryPost ───────────────────────────────────────────────────────

describe('updateGalleryPost', () => {
  it('updates the caption of an existing post', () => {
    getState().updateGalleryPost('post-1', 'Updated caption', ['p2']);

    const post = getState().gallery.find((p) => p.id === 'post-1');
    expect(post?.caption).toBe('Updated caption');
  });

  it('reconciles tags: adds new and removes old', () => {
    // post-1 initially has tag for p2
    getState().updateGalleryPost('post-1', 'caption', ['p1', 'p3']);

    const tags = getState().galleryTags.filter((t) => t.post_id === 'post-1');
    const taggedPlayerIds = tags.map((t) => t.player_id).sort();
    expect(taggedPlayerIds).toEqual(['p1', 'p3']);
    // p2 should be removed
    expect(tags.find((t) => t.player_id === 'p2')).toBeUndefined();
  });

  it('keeps existing tags that are still in the new list', () => {
    // post-1 has p2 tagged; update to keep p2 and add p1
    getState().updateGalleryPost('post-1', 'same', ['p2', 'p1']);

    const tags = getState().galleryTags.filter((t) => t.post_id === 'post-1');
    expect(tags).toHaveLength(2);
    expect(tags.map((t) => t.player_id).sort()).toEqual(['p1', 'p2']);
  });
});

// ── deleteGalleryPost ───────────────────────────────────────────────────────

describe('deleteGalleryPost', () => {
  it('sets deleted_at timestamp on the post', () => {
    getState().deleteGalleryPost('post-2');

    const post = getState().gallery.find((p) => p.id === 'post-2');
    expect(post?.deleted_at).toBeTruthy();
    expect(typeof post?.deleted_at).toBe('string');
  });

  it('does not remove the post from the array', () => {
    const before = getState().gallery.length;
    getState().deleteGalleryPost('post-2');
    expect(getState().gallery).toHaveLength(before);
  });

  it('handles deleting an already-deleted post (sets new timestamp)', () => {
    // post-deleted already has deleted_at set
    const oldDeletedAt = getState().gallery.find((p) => p.id === 'post-deleted')?.deleted_at;
    expect(oldDeletedAt).toBeTruthy();

    getState().deleteGalleryPost('post-deleted');

    const post = getState().gallery.find((p) => p.id === 'post-deleted');
    expect(post?.deleted_at).toBeTruthy();
    // The timestamp should be refreshed (different from original)
    expect(post?.deleted_at).not.toBe(oldDeletedAt);
  });
});

// ── Gallery Comments ────────────────────────────────────────────────────────

describe('addGalleryComment', () => {
  it('adds a comment with correct fields', () => {
    const before = getState().galleryComments.length;

    getState().addGalleryComment('post-1', PLAYER_USER_1.id, 'Bhaskar Bachi', 'Nice shot!');

    const { galleryComments } = getState();
    expect(galleryComments).toHaveLength(before + 1);

    const newComment = galleryComments[galleryComments.length - 1];
    expect(newComment.post_id).toBe('post-1');
    expect(newComment.user_id).toBe(PLAYER_USER_1.id);
    expect(newComment.comment_by).toBe('Bhaskar Bachi');
    expect(newComment.text).toBe('Nice shot!');
    expect(newComment.created_at).toBeTruthy();
    expect(newComment.id).toBeTruthy();
  });

  it('adds comment to non-existent post without crashing', () => {
    const before = getState().galleryComments.length;

    getState().addGalleryComment('non-existent-post', PLAYER_USER_1.id, 'Test', 'Hello');

    const { galleryComments } = getState();
    expect(galleryComments).toHaveLength(before + 1);

    const newComment = galleryComments[galleryComments.length - 1];
    expect(newComment.post_id).toBe('non-existent-post');
    expect(newComment.text).toBe('Hello');
  });
});

describe('updateGalleryComment', () => {
  it('updates the text of an existing comment', () => {
    getState().updateGalleryComment('comment-1', 'Updated text!');

    const comment = getState().galleryComments.find((c) => c.id === 'comment-1');
    expect(comment?.text).toBe('Updated text!');
  });

  it('does not crash when updating a non-existent comment', () => {
    const before = getState().galleryComments.length;

    // Should not throw
    getState().updateGalleryComment('non-existent-comment', 'Nothing');

    // State should remain unchanged
    expect(getState().galleryComments).toHaveLength(before);
  });
});

describe('deleteGalleryComment', () => {
  it('removes the comment from the array', () => {
    const before = getState().galleryComments.length;

    getState().deleteGalleryComment('comment-1');

    expect(getState().galleryComments).toHaveLength(before - 1);
    expect(getState().galleryComments.find((c) => c.id === 'comment-1')).toBeUndefined();
  });

  it('does not affect other comments', () => {
    getState().deleteGalleryComment('comment-1');

    const remaining = getState().galleryComments.find((c) => c.id === 'comment-2');
    expect(remaining).toBeDefined();
    expect(remaining?.text).toBe('Thanks team!');
  });
});

// ── Gallery Likes ───────────────────────────────────────────────────────────

describe('toggleGalleryLike', () => {
  it('adds a like with likerName when not already liked', () => {
    const before = getState().galleryLikes.length;

    // Admin has not liked post-1 yet
    getState().toggleGalleryLike('post-1', ADMIN_USER.id, 'Super Admin');

    const { galleryLikes } = getState();
    expect(galleryLikes).toHaveLength(before + 1);

    const newLike = galleryLikes.find(
      (l) => l.post_id === 'post-1' && l.user_id === ADMIN_USER.id,
    );
    expect(newLike).toBeDefined();
    expect(newLike?.liked_by).toBe('Super Admin');
  });

  it('removes existing like on second call (toggle off)', () => {
    // PLAYER_USER_2 already likes post-1 (like-1)
    const before = getState().galleryLikes.length;

    getState().toggleGalleryLike('post-1', PLAYER_USER_2.id, 'Manigopal');

    expect(getState().galleryLikes).toHaveLength(before - 1);
    expect(
      getState().galleryLikes.find(
        (l) => l.post_id === 'post-1' && l.user_id === PLAYER_USER_2.id,
      ),
    ).toBeUndefined();
  });

  it('like same post twice toggles: add then remove', () => {
    const before = getState().galleryLikes.length;

    // Add like
    getState().toggleGalleryLike('post-2', ADMIN_USER.id, 'Super Admin');
    expect(getState().galleryLikes).toHaveLength(before + 1);

    // Remove like
    getState().toggleGalleryLike('post-2', ADMIN_USER.id, 'Super Admin');
    expect(getState().galleryLikes).toHaveLength(before);
  });

  it('sets liked_by to null when likerName is not provided', () => {
    getState().toggleGalleryLike('post-2', ADMIN_USER.id);

    const like = getState().galleryLikes.find(
      (l) => l.post_id === 'post-2' && l.user_id === ADMIN_USER.id,
    );
    expect(like?.liked_by).toBeNull();
  });
});

// ── Comment Reactions ───────────────────────────────────────────────────────

describe('toggleCommentReaction', () => {
  it('adds a reaction when none exists for that user+emoji combo', () => {
    const before = getState().commentReactions.length;

    getState().toggleCommentReaction('comment-1', PLAYER_USER_2.id, '🔥');

    const { commentReactions } = getState();
    expect(commentReactions).toHaveLength(before + 1);

    const newReaction = commentReactions.find(
      (r) => r.comment_id === 'comment-1' && r.user_id === PLAYER_USER_2.id && r.emoji === '🔥',
    );
    expect(newReaction).toBeDefined();
  });

  it('removes existing reaction on second call with same emoji', () => {
    // PLAYER_USER_1 already has a thumbs-up on comment-1 (reaction-1)
    const before = getState().commentReactions.length;

    getState().toggleCommentReaction('comment-1', PLAYER_USER_1.id, '👍');

    expect(getState().commentReactions).toHaveLength(before - 1);
    expect(
      getState().commentReactions.find((r) => r.id === 'reaction-1'),
    ).toBeUndefined();
  });

  it('allows different emojis from same user on same comment', () => {
    const before = getState().commentReactions.length;

    // PLAYER_USER_1 already has 👍 on comment-1; adding 🔥 should not remove 👍
    getState().toggleCommentReaction('comment-1', PLAYER_USER_1.id, '🔥');

    expect(getState().commentReactions).toHaveLength(before + 1);
    // Both should exist
    expect(
      getState().commentReactions.find(
        (r) => r.comment_id === 'comment-1' && r.user_id === PLAYER_USER_1.id && r.emoji === '👍',
      ),
    ).toBeDefined();
    expect(
      getState().commentReactions.find(
        (r) => r.comment_id === 'comment-1' && r.user_id === PLAYER_USER_1.id && r.emoji === '🔥',
      ),
    ).toBeDefined();
  });
});

// ── Notifications ───────────────────────────────────────────────────────────

describe('markNotificationsRead', () => {
  it('marks all notifications as read', () => {
    // Fixture has one unread (notif-1) and one read (notif-2)
    expect(getState().notifications.some((n) => !n.is_read)).toBe(true);

    getState().markNotificationsRead();

    const { notifications } = getState();
    expect(notifications.every((n) => n.is_read)).toBe(true);
    // Should still have same count
    expect(notifications).toHaveLength(NOTIFICATIONS.length);
  });

  it('is a no-op when all notifications are already read', () => {
    // Mark all read first
    getState().markNotificationsRead();
    const after1 = getState().notifications;

    // Call again; should not throw or change state
    getState().markNotificationsRead();
    const after2 = getState().notifications;

    // References may differ but content should be the same
    expect(after2).toHaveLength(after1.length);
    expect(after2.every((n) => n.is_read)).toBe(true);
  });
});

describe('clearNotifications', () => {
  it('empties the notifications array', () => {
    expect(getState().notifications.length).toBeGreaterThan(0);

    getState().clearNotifications();

    expect(getState().notifications).toEqual([]);
  });

  it('is a no-op when notifications are already empty', () => {
    getState().clearNotifications();
    expect(getState().notifications).toEqual([]);

    // Call again; should not throw
    getState().clearNotifications();
    expect(getState().notifications).toEqual([]);
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('tag reconciliation: add post with 3 tags, update to 1, verify 2 removed', () => {
    // Add post with 3 tags
    getState().addGalleryPost(
      PLAYER_USER_1.id,
      'season-spring-2026',
      ['https://example.com/triple.jpg'],
      'Three tags',
      'Bhaskar Bachi',
      ['p1', 'p2', 'p3'],
    );

    const newPostId = getState().gallery[0].id;
    const tagsAfterAdd = getState().galleryTags.filter((t) => t.post_id === newPostId);
    expect(tagsAfterAdd).toHaveLength(3);

    // Update to only 1 tag (p2)
    getState().updateGalleryPost(newPostId, 'One tag now', ['p2']);

    const tagsAfterUpdate = getState().galleryTags.filter((t) => t.post_id === newPostId);
    expect(tagsAfterUpdate).toHaveLength(1);
    expect(tagsAfterUpdate[0].player_id).toBe('p2');
  });

  it('deleting a non-existent post does not crash or add entries', () => {
    const before = getState().gallery.length;

    getState().deleteGalleryPost('totally-fake-id');

    expect(getState().gallery).toHaveLength(before);
  });

  it('deleting a non-existent comment does not crash', () => {
    const before = getState().galleryComments.length;

    getState().deleteGalleryComment('non-existent-comment-id');

    expect(getState().galleryComments).toHaveLength(before);
  });

  it('toggling like on same post by same user twice returns to original state', () => {
    const originalLikes = [...getState().galleryLikes];

    // Add then remove
    getState().toggleGalleryLike('post-2', ADMIN_USER.id, 'Admin');
    getState().toggleGalleryLike('post-2', ADMIN_USER.id, 'Admin');

    expect(getState().galleryLikes).toHaveLength(originalLikes.length);
    // No like from admin on post-2
    expect(
      getState().galleryLikes.find(
        (l) => l.post_id === 'post-2' && l.user_id === ADMIN_USER.id,
      ),
    ).toBeUndefined();
  });

  it('toggling comment reaction twice returns to original state', () => {
    const originalReactions = [...getState().commentReactions];

    getState().toggleCommentReaction('comment-2', PLAYER_USER_2.id, '❤️');
    getState().toggleCommentReaction('comment-2', PLAYER_USER_2.id, '❤️');

    expect(getState().commentReactions).toHaveLength(originalReactions.length);
  });

  it('multiple posts can be added sequentially, each prepended', () => {
    getState().addGalleryPost(PLAYER_USER_1.id, 'season-spring-2026', ['url1'], 'First', null, []);
    getState().addGalleryPost(PLAYER_USER_2.id, 'season-spring-2026', ['url2'], 'Second', null, []);

    const { gallery } = getState();
    // Most recent should be first
    expect(gallery[0].caption).toBe('Second');
    expect(gallery[1].caption).toBe('First');
  });

  it('update gallery post with empty tags removes all tags', () => {
    // post-1 has tag for p2
    const tagsBefore = getState().galleryTags.filter((t) => t.post_id === 'post-1');
    expect(tagsBefore.length).toBeGreaterThan(0);

    getState().updateGalleryPost('post-1', 'No tags', []);

    const tagsAfter = getState().galleryTags.filter((t) => t.post_id === 'post-1');
    expect(tagsAfter).toHaveLength(0);
  });
});
