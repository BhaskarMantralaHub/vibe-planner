'use client';

import { useState, useRef, useEffect } from 'react';

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
    }
  }, []);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleSave();
    }
  };

  return (
    <div className="mt-2 animate-[slideIn_0.15s]">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add notes, URLs, or justifications..."
        className="w-full min-h-[60px] bg-[var(--surface)] border border-[var(--border)] rounded-md text-[var(--text)] p-2 text-xs font-sans outline-none resize-y focus:border-[var(--indigo)]"
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          onClick={handleSave}
          className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--indigo)] text-white font-medium hover:opacity-90 transition-opacity"
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors"
        >
          Cancel
        </button>
        {notes && (
          <button
            onClick={handleDelete}
            className="text-[10px] px-2.5 py-1 rounded-md text-[var(--red)] hover:bg-[var(--red)]/10 transition-colors ml-auto"
          >
            Delete Notes
          </button>
        )}
      </div>
    </div>
  );
}
