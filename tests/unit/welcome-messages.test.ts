import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getWelcomeMessage,
  getWelcomeCaption,
} from '../../app/(tools)/cricket/lib/welcome-messages';

// ─── getWelcomeMessage ───────────────────────────────────────────────

describe('getWelcomeMessage', () => {
  it('returns a string containing the player name', () => {
    const msg = getWelcomeMessage('Rohit');
    expect(msg).toContain('Rohit');
  });

  it('never returns an empty string', () => {
    for (let i = 0; i < 20; i++) {
      const msg = getWelcomeMessage('TestPlayer');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('returns a non-empty string for an empty player name', () => {
    const msg = getWelcomeMessage('');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('can return different messages across multiple calls', () => {
    const results = new Set<string>();
    // With 10 templates, 50 calls should produce at least 2 distinct messages
    for (let i = 0; i < 50; i++) {
      results.add(getWelcomeMessage('Virat'));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('returns a specific message when Math.random is mocked', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // first template
    const msg = getWelcomeMessage('Sachin');
    expect(msg).toBe(
      "Welcome to the squad, Sachin! Let's make this season one for the books"
    );
    vi.restoreAllMocks();
  });

  it('returns the last template when Math.random approaches 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const msg = getWelcomeMessage('Dhoni');
    expect(msg).toContain('Dhoni');
    expect(msg).toContain("Let's go");
    vi.restoreAllMocks();
  });
});

// ─── getWelcomeCaption ───────────────────────────────────────────────

describe('getWelcomeCaption', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('contains @playerName mention', () => {
    const caption = getWelcomeCaption('Kohli');
    expect(caption).toContain('@Kohli');
  });

  it('contains @Everyone mention', () => {
    const caption = getWelcomeCaption('Kohli');
    expect(caption).toContain('@Everyone');
  });

  it('contains the welcome message text', () => {
    const caption = getWelcomeCaption('Bumrah');
    // With Math.random mocked to 0, the first template is used
    expect(caption).toContain(
      "Welcome to the squad, Bumrah! Let's make this season one for the books"
    );
  });

  it('follows the format: message @name @Everyone', () => {
    const caption = getWelcomeCaption('Gill');
    const welcomeMsg = getWelcomeMessage('Gill');
    expect(caption).toBe(`${welcomeMsg} @Gill @Everyone`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
