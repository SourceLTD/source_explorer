'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-20">
      <div className="max-w-4xl mx-auto text-center px-6">
        {/* Source Console Header */}
        <div className="mb-12">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            Source Console
          </h1>
        </div>

        {/* Selection Grid */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Frames */}
          <div 
            onClick={() => router.push('/table/frames')}
            className="bg-white rounded-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Frames</h2>
              <p className="text-gray-600 text-sm">Explore semantic frames and their roles</p>
            </div>
            <div className="flex items-center justify-center text-blue-600 font-medium group-hover:text-blue-600">
              Explore Frames
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>

          {/* Lexical Entries */}
          <div 
            onClick={() => router.push('/table')}
            className="bg-white rounded-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Lexical Entries</h2>
              <p className="text-gray-600 text-sm">Explore verbs, nouns, adjectives, and adverbs</p>
            </div>
            <div className="flex items-center justify-center text-blue-600 font-medium group-hover:text-blue-600">
              Explore Lexical Entries
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-sm text-gray-500">
          Select a category to explore lexical relationships and meanings
        </div>
      </div>
    </div>
  );
}