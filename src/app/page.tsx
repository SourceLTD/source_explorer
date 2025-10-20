'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center py-20">
      <div className="max-w-4xl mx-auto text-center px-6">
        {/* SourceNet Header */}
        <div className="mb-12">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            SourceNet
          </h1>
        </div>

        {/* Part of Speech Selection */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Verbs */}
          <div 
            onClick={() => router.push('/graph')}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Verbs</h2>
            </div>
            <div className="flex items-center justify-center text-blue-600 font-medium group-hover:text-blue-700">
              Explore Verbs
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>

          {/* Adverbs */}
          <div className="bg-white rounded-2xl shadow-lg transition-all duration-300 cursor-not-allowed border border-gray-200 p-8 opacity-60">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-500 mb-3">Adverbs</h2>
            </div>
            <div className="flex items-center justify-center text-gray-400 font-medium">
              Coming Soon
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

          {/* Nouns */}
          <div 
            onClick={() => router.push('/graph/nouns')}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Nouns</h2>
            </div>
            <div className="flex items-center justify-center text-blue-600 font-medium group-hover:text-blue-700">
              Explore Nouns
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>

          {/* Adjectives */}
          <div 
            onClick={() => router.push('/graph/adjectives')}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Adjectives</h2>
            </div>
            <div className="flex items-center justify-center text-blue-600 font-medium group-hover:text-blue-700">
              Explore Adjectives
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-sm text-gray-500">
          Select a part of speech to explore lexical relationships and meanings
        </div>
      </div>
    </div>
  );
}