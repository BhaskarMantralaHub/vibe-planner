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

  it('contains Vibe Planner tool with toolkit role', () => {
    const vp = tools.find((t) => t.name === 'Vibe Planner');
    expect(vp).toBeDefined();
    expect(vp!.href).toBe('/vibe-planner');
    expect(vp!.roles).toContain('toolkit');
  });

  it('contains ID Tracker tool with toolkit role', () => {
    const idTracker = tools.find((t) => t.name === 'ID Tracker');
    expect(idTracker).toBeDefined();
    expect(idTracker!.href).toBe('/id-tracker');
    expect(idTracker!.roles).toContain('toolkit');
  });

  it('contains Cricket tool with cricket role', () => {
    const cricket = tools.find((t) => t.name === 'Cricket');
    expect(cricket).toBeDefined();
    expect(cricket!.href).toBe('/cricket');
    expect(cricket!.roles).toContain('cricket');
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

  it('cricket tool also has admin role', () => {
    const cricket = tools.find((t) => t.name === 'Cricket');
    expect(cricket!.roles).toContain('admin');
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
    expect(names).toContain('Cricket');
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
