'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useCricketStore } from '@/stores/cricket-store';
import { getMonthlySpending, formatCurrency } from '../lib/utils';
import { EmptyState } from '@/components/ui';

export default function MonthlyBar() {
  const { expenses, selectedSeasonId } = useCricketStore();
  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const data = getMonthlySpending(seasonExpenses);

  if (data.length === 0) return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden min-w-0">
      <EmptyState
        icon="📊"
        title="No monthly data"
        description="Monthly spending trends will show up here as expenses are logged"
      />
    </div>
  );

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 overflow-hidden min-w-0">
      <h3 className="mb-4 text-[16px] font-semibold text-[var(--text)]">Monthly Spending</h3>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [formatCurrency(Number(value)), 'Spent']}
              contentStyle={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                fontSize: '13px',
                color: 'var(--text)',
              }}
            />
            <Bar dataKey="total" fill="var(--cricket)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
