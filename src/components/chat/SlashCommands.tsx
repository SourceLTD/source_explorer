'use client';

import { useMemo } from 'react';

export type SlashCommand = {
  name: string;
  description: string;
  action: string;
};

export const slashCommands: SlashCommand[] = [
  { name: 'new', description: 'Start a new conversation', action: 'new' },
  { name: 'clear', description: 'Clear current messages', action: 'clear' },
  { name: 'delete', description: 'Delete this chat', action: 'delete' },
  { name: 'purge', description: 'Delete all chats', action: 'purge' },
  { name: 'model', description: 'Switch AI model', action: 'model' },
];

interface SlashCommandMenuProps {
  query: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
}

export default function SlashCommandMenu({
  query,
  selectedIndex,
  onSelect,
}: SlashCommandMenuProps) {
  const filtered = useMemo(
    () => slashCommands.filter((cmd) => cmd.name.startsWith(query.toLowerCase())),
    [query],
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-20 py-1 overflow-hidden">
      {filtered.map((cmd, index) => (
        <button
          key={cmd.name}
          type="button"
          onClick={() => onSelect(cmd)}
          className={`w-full text-left px-3 py-2 transition-colors ${
            index === selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="text-sm font-medium">/{cmd.name}</span>
          <span className="text-xs text-gray-500 ml-2">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}
