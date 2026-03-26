'use client';

import { useState, useRef, useEffect } from 'react';
import { Save, X, Trash2, FileText } from 'lucide-react';
import { Text } from '@/components/ui';

interface CardNotesProps {
  notes: string;
  onSave: (notes: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function CardNotes({ notes, onSave, onDelete, onClose }: CardNotesProps) {
  const [text, setText] = useState(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.selectionStart = ta.value.length;
      ta.style.height = 'auto';
      ta.style.height = Math.max(80, ta.scrollHeight) + 'px';
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.max(80, e.target.scrollHeight) + 'px';
  };

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleSave();
  };

  const hasChanges = text !== notes;

  return (
    <div className="animate-[slideIn_0.15s]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[var(--orange)]" />
          <Text size="md" weight="semibold">Notes</Text>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Add notes, URLs, or justifications..."
        className="w-full min-h-[80px] rounded-xl text-[var(--text)] px-4 py-3 text-[15px] leading-relaxed font-sans outline-none resize-none transition-all placeholder:text-[var(--dim)]"
        style={{
          background: 'linear-gradient(135deg, var(--surface), var(--card))',
          border: '1.5px solid var(--toolkit)',
          boxShadow: '0 0 0 3px color-mix(in srgb, var(--toolkit) 15%, transparent)',
        }}
      />

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all active:scale-[0.98]"
          style={{
            background: hasChanges ? 'linear-gradient(135deg, var(--toolkit), var(--toolkit-accent))' : 'var(--surface)',
            color: hasChanges ? '#fff' : 'var(--muted)',
            border: hasChanges ? 'none' : '1px solid var(--border)',
          }}
        >
          <Save size={14} />
          Save
        </button>

        <button
          onClick={onClose}
          className="px-3 py-2 rounded-xl text-[13px] font-medium text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
        >
          Cancel
        </button>

        {notes && (
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium text-white cursor-pointer transition-all ml-auto active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, var(--red), #dc2626)' }}
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
