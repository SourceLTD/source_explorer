'use client';

import React from 'react';

export interface ReallocationBridgeProps {
  origin: React.ReactNode;
  focus: React.ReactNode;
  destination: React.ReactNode;
  className?: string;
}

export default function ReallocationBridge({
  origin,
  focus,
  destination,
  className = '',
}: ReallocationBridgeProps) {
  return (
    <div className={`relative flex items-stretch gap-0 ${className}`}>
      {/* Origin Column */}
      <div className="flex-1 min-w-0 z-10 flex flex-col gap-4">
        {origin}
      </div>

      {/* Origin to Focus Bridge */}
      <div className="w-16 shrink-0 relative pointer-events-none">
        <svg className="absolute inset-0 w-full h-full" overflow="visible">
          <defs>
            <marker
              id="arrow-origin"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#D1D5DB" />
            </marker>
          </defs>
          {/* We'll refine the path logic if needed when standardizing vertical alignment */}
          <line 
            x1="0" y1="50%" x2="100%" y2="50%" 
            stroke="#D1D5DB" 
            strokeWidth="2" 
            strokeDasharray="4 2"
            markerEnd="url(#arrow-origin)"
          />
        </svg>
      </div>

      {/* Focus Column */}
      <div className="w-72 shrink-0 z-20 flex flex-col justify-center">
        {focus}
      </div>

      {/* Focus to Destination Bridge */}
      <div className="w-16 shrink-0 relative pointer-events-none">
        <svg className="absolute inset-0 w-full h-full" overflow="visible">
          <defs>
            <marker
              id="arrow-dest"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3B82F6" />
            </marker>
          </defs>
          <line 
            x1="0" y1="50%" x2="100%" y2="50%" 
            stroke="#3B82F6" 
            strokeWidth="3" 
            markerEnd="url(#arrow-dest)"
          />
        </svg>
      </div>

      {/* Destination Column */}
      <div className="flex-1 min-w-0 z-10 flex flex-col gap-4">
        {destination}
      </div>
    </div>
  );
}
