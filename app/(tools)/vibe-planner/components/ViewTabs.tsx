'use client';

interface ViewTabsProps {
  view: string;
  onViewChange: (view: string) => void;
}

const TABS = [
  { key: 'board', label: 'Board' },
  { key: 'timeline', label: 'Timeline' },
];

export default function ViewTabs({ view, onViewChange }: ViewTabsProps) {
  return (
    <div className="bg-[var(--surface)] rounded-xl p-1 inline-flex">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onViewChange(tab.key)}
          className={`px-5 py-2 text-[15px] font-medium rounded-lg transition-all ${
            view === tab.key
              ? 'bg-[var(--card)] text-[var(--text)] shadow-sm'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
