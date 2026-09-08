import { describe, it, expect } from 'vitest';
import { tools, type Tool } from '@/lib/nav';

describe('lib/nav', () => {
  it('exports a non-empty tools array', () => {
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('each tool has required fields: name, href, icon, description, roles', () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.href).toBeTruthy();
      expect(tool.href.startsWith('/')).toBe(true);
      expect(tool.icon).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(Array.isArray(tool.roles)).toBe(true);
      expect(tool.roles!.length).toBeGreaterThan(0);
    }
  });

  it('does not surface the deprecated personal tools', () => {
    // Deprecated 2026-09-02: Vibe Planner and ID Tracker are hidden from the
    // menu (routes and data intentionally still work by direct URL). If they
    // are ever re-enabled in lib/nav.tsx, update this expectation.
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('Vibe Planner');
    expect(names).not.toContain('ID Tracker');
  });

  it('contains Roster tool (the /cricket hub, renamed from Cricket) with cricket role', () => {
    const roster = tools.find((t) => t.name === 'Roster');
    expect(roster).toBeDefined();
    // MUST carry ?view=players. This assertion used to read `'/cricket'`,
    // which is to say the test enforced the bug: a bare /cricket signals its
    // destination by ABSENCE of a view, and absence cannot override state
    // that is already set. Arriving from Finances (which leaves
    // `#expenses` in the URL and 'expenses' in sessionStorage), tapping
    // Roster reset nothing — same pathname means no remount, a null ?view=
    // makes the effect return early, and an empty hash is not a valid view —
    // so the hamburger's Roster opened the Finances tab.
    expect(roster!.href).toBe('/cricket?view=players');
    expect(roster!.roles).toContain('cricket');
    // The old label must be gone everywhere — one vocabulary.
    expect(tools.find((t) => t.name === 'Cricket')).toBeUndefined();
  });

  it('every dashboard nav entry states its view explicitly', () => {
    // The invariant that would have caught the Roster bug, generalised: any
    // entry pointing at the /cricket dashboard must name the view it wants.
    // A bare '/cricket' is never correct here, because the dashboard holds
    // five in-page views and remembers the last one you were on.
    const dashboardEntries = tools.filter(
      (t) => t.href === '/cricket' || t.href.startsWith('/cricket?') || t.href.startsWith('/cricket#'),
    );
    expect(dashboardEntries.length).toBeGreaterThan(0);
    for (const t of dashboardEntries) {
      expect(t.href, `"${t.name}" must deep-link with ?view=`).toMatch(/^\/cricket\?view=[a-z]+$/);
    }
  });

  it('dashboard entries use ?view= rather than a #hash', () => {
    // Hash links look equivalent and are not: the App Router commits the URL
    // after render and fires no hashchange, so a #hash silently lands on
    // whatever view was already active. useSearchParams is reactive on
    // same-route navigations, which is the case that broke.
    for (const t of tools) {
      expect(t.href, `"${t.name}" must not rely on a #hash`).not.toMatch(/^\/cricket#/);
    }
  });

  it('contains Admin tool with admin role only', () => {
    const admin = tools.find((t) => t.name === 'Admin');
    expect(admin).toBeDefined();
    expect(admin!.href).toBe('/admin');
    expect(admin!.roles).toEqual(['admin']);
  });

  it('all toolkit tools also have admin role', () => {
    const toolkitTools = tools.filter((t) => t.roles?.includes('toolkit'));
    for (const tool of toolkitTools) {
      expect(tool.roles).toContain('admin');
    }
  });

  it('roster tool also has admin role', () => {
    const roster = tools.find((t) => t.name === 'Roster');
    expect(roster!.roles).toContain('admin');
  });

  it('contains Finances tool deep-linking to the cricket finances tab', () => {
    const fin = tools.find((t) => t.name === 'Finances');
    expect(fin).toBeDefined();
    // Query-param deep-link: hash links break on App Router client
    // navigations (no hashchange event, URL committed after render); the
    // dashboard consumes ?view= reactively via useSearchParams.
    expect(fin!.href).toBe('/cricket?view=expenses');
    expect(fin!.roles).toContain('cricket');
    expect(fin!.roles).toContain('admin');
    expect(fin!.feature).toBe('cricket');
  });

  it('contains League Stats tool with cricket and admin roles', () => {
    const leagueStats = tools.find((t) => t.name === 'League Stats');
    expect(leagueStats).toBeDefined();
    expect(leagueStats!.href).toBe('/cricket/league-stats');
    expect(leagueStats!.roles).toContain('cricket');
    expect(leagueStats!.roles).toContain('admin');
  });

  it('does not surface the hidden Live Scoring / Practice Stats tools', () => {
    // Hidden from the menu 2026-05-04 (routes kept). If re-enabled in
    // lib/nav.tsx, update this expectation.
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('Live Scoring');
    expect(names).not.toContain('Practice Stats');
  });

  it('all tool hrefs are unique', () => {
    const hrefs = tools.map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('all tool names are unique', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('toolkit tools have vibe-planner or id-tracker feature', () => {
    const toolkitTools = tools.filter((t) => t.roles?.includes('toolkit'));
    for (const tool of toolkitTools) {
      expect(['vibe-planner', 'id-tracker']).toContain(tool.feature);
    }
  });

  it('cricket tools have cricket feature', () => {
    const cricketTools = tools.filter((t) => t.roles?.includes('cricket'));
    for (const tool of cricketTools) {
      expect(tool.feature).toBe('cricket');
    }
  });

  it('Admin tool has no feature (role-gated only)', () => {
    const admin = tools.find((t) => t.name === 'Admin');
    expect(admin!.feature).toBeUndefined();
  });

  it('feature-based filtering shows only tools matching user features', () => {
    const cricketFeatures = ['cricket'];
    const visibleForCricket = tools.filter((t) => {
      if (t.feature) return cricketFeatures.includes(t.feature);
      return false;
    });
    const names = visibleForCricket.map((t) => t.name);
    expect(names).toContain('Roster');
    expect(names).toContain('League Schedule');
    expect(names).toContain('League Stats');
    expect(names).not.toContain('Vibe Planner');
    expect(names).not.toContain('ID Tracker');
    expect(names).not.toContain('Admin');
  });

  it('admin user with no features sees no feature-gated tools', () => {
    const adminFeatures: string[] = [];
    const adminAccess = ['admin'];
    const visible = tools.filter((t) => {
      if (t.feature) return adminFeatures.includes(t.feature);
      if (!t.roles) return true;
      return t.roles.some((r) => adminAccess.includes(r));
    });
    // Only Admin tool visible (role-gated, no feature)
    expect(visible.length).toBe(1);
    expect(visible[0].name).toBe('Admin');
  });
});
