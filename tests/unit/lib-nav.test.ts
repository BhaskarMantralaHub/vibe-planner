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

  it('contains Live Scoring tool with cricket and admin roles', () => {
    const scoring = tools.find((t) => t.name === 'Live Scoring');
    expect(scoring).toBeDefined();
    expect(scoring!.href).toBe('/cricket/scoring');
    expect(scoring!.roles).toContain('cricket');
    expect(scoring!.roles).toContain('admin');
  });

  it('all tool hrefs are unique', () => {
    const hrefs = tools.map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('all tool names are unique', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
