'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useCricketStore } from '@/stores/cricket-store';
import { getCategoryBreakdown, formatCurrency } from '../lib/utils';
import { getCategoryConfig } from '../lib/constants';

export default function CategoryDonut() {
  const { expenses, selectedSeasonId } = useCricketStore();
  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const breakdown = getCategoryBreakdown(seasonExpenses);

  if (breakdown.length === 0) return null;

  const data = breakdown.map((b) => ({
    name: getCategoryConfig(b.category).label,
    value: b.total,
    color: getCategoryConfig(b.category).color,
    percentage: b.percentage,
  }));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 overflow-hidden min-w-0">
      <h3 className="mb-4 text-[16px] font-semibold text-[var(--text)]">Where Money Goes</h3>
      <div className="flex items-center gap-6">
        <div className="h-[140px] w-[140px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={35}
                outerRadius={65}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => formatCurrency(Number(value))}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  fontSize: '13px',
                  color: 'var(--text)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[13px] text-[var(--text)]">{d.name}</span>
              <span className="text-[13px] text-[var(--muted)]">{d.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
