'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { Text, Button, Card, Badge } from '@/components/ui';
import { MdPersonAdd, MdCheck, MdClose } from 'react-icons/md';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PendingMembers() {
  const { pendingMembers, approveMember, rejectMember } = useCricketStore();
  const [processing, setProcessing] = useState<string | null>(null);

  if (pendingMembers.length === 0) return null;

  const handleApprove = async (userId: string) => {
    setProcessing(userId);
    await approveMember(userId);
    setProcessing(null);
  };

  const handleReject = async (userId: string) => {
    setProcessing(userId);
    await rejectMember(userId);
    setProcessing(null);
  };

  return (
    <Card className="mb-4 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          background: 'color-mix(in srgb, var(--orange) 8%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--orange) 20%, transparent)',
        }}
      >
        <MdPersonAdd size={18} style={{ color: 'var(--orange)' }} />
        <Text size="sm" weight="semibold">Pending Members</Text>
        <Badge variant="orange" className="ml-auto">{pendingMembers.length}</Badge>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {pendingMembers.map((member) => {
          const isProcessing = processing === member.user_id;
          return (
            <div key={member.user_id} className="flex items-center gap-3 px-4 py-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background: 'color-mix(in srgb, var(--cricket) 12%, transparent)',
                  color: 'var(--cricket)',
                }}
              >
                <Text size="sm" weight="bold">
                  {member.name.charAt(0).toUpperCase()}
                </Text>
              </div>
              <div className="flex-1 min-w-0">
                <Text size="sm" weight="semibold" truncate>{member.name}</Text>
                <Text size="2xs" color="muted" truncate>{member.email}</Text>
                <Text size="2xs" color="dim">{timeAgo(member.joined_at)}</Text>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleApprove(member.user_id)}
                  disabled={isProcessing}
                  className="w-11 h-11 flex items-center justify-center rounded-xl cursor-pointer transition-all active:scale-90 disabled:opacity-50"
                  style={{
                    background: 'color-mix(in srgb, var(--green) 12%, transparent)',
                    color: 'var(--green)',
                  }}
                  title="Approve"
                >
                  <MdCheck size={22} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Reject ${member.name}? They will be removed from the pending list.`)) {
                      handleReject(member.user_id);
                    }
                  }}
                  disabled={isProcessing}
                  className="w-11 h-11 flex items-center justify-center rounded-xl cursor-pointer transition-all active:scale-90 disabled:opacity-50"
                  style={{
                    background: 'color-mix(in srgb, var(--red) 10%, transparent)',
                    color: 'var(--red)',
                  }}
                  title="Reject"
                >
                  <MdClose size={22} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
