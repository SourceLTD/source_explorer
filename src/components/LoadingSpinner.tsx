'use client';

import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'page' | 'modal';
  className?: string;
  label?: string;
  fullPage?: boolean;
  noPadding?: boolean;
  isSpinning?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
  page: 'w-12 h-12',
  modal: 'w-8 h-8',
};

export default function LoadingSpinner({
  size = 'xl',
  className = '',
  label,
  fullPage = false,
  noPadding = false,
  isSpinning = true,
}: LoadingSpinnerProps) {
  const paddingClass = noPadding ? '' : (fullPage ? 'py-24' : 'py-4');
  const colorClass = className.includes('text-') ? '' : 'text-gray-400';
  
  return (
    <div className={`flex flex-col items-center justify-center ${paddingClass} ${className}`}>
      <ArrowPathIcon className={`${sizeClasses[size]} ${colorClass} ${isSpinning ? 'animate-spin' : ''}`} />
      {label && <p className={`mt-4 font-medium text-gray-700`}>{label}</p>}
    </div>
  );
}

