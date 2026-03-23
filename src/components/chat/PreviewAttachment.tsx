'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';

interface PreviewAttachmentProps {
  url: string;
  name: string;
  onRemove?: () => void;
  isUploading?: boolean;
}

export default function PreviewAttachment({
  url,
  name,
  onRemove,
  isUploading,
}: PreviewAttachmentProps) {
  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200 w-16 h-16 flex-shrink-0">
      {isUploading ? (
        <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <img
          src={url}
          alt={name}
          className="w-full h-full object-cover"
        />
      )}
      {onRemove && !isUploading && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 bg-gray-800/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <XMarkIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
