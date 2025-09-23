'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-4xl mx-auto text-center px-6">
        {/* SourceNet Header */}
        <div className="mb-12">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            SourceNet
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Explore lexical relationships through interactive graphs or browse comprehensive data tables
          </p>
        </div>

        {/* Part of Speech Selection */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Verbs */}
          <div 
            onClick={() => router.push('/graph')}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Verbs</h2>
              <p className="text-gray-600 leading-relaxed">
                Explore action words and their relationships. Discover how verbs connect through causation, entailment, and similarity.
              </p>
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
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-500 mb-3">Adverbs</h2>
              <p className="text-gray-500 leading-relaxed">
                Discover words that modify verbs, adjectives, and other adverbs. Understand how manner, time, and degree are expressed.
              </p>
            </div>
            <div className="flex items-center justify-center text-gray-400 font-medium">
              Coming Soon
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

          {/* Nouns */}
          <div className="bg-white rounded-2xl shadow-lg transition-all duration-300 cursor-not-allowed border border-gray-200 p-8 opacity-60">
            <div className="mb-6">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-500 mb-3">Nouns</h2>
              <p className="text-gray-500 leading-relaxed">
                Navigate through people, places, things, and concepts. Explore hierarchical relationships and semantic categories.
              </p>
            </div>
            <div className="flex items-center justify-center text-gray-400 font-medium">
              Coming Soon
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

          {/* Adjectives */}
          <div className="bg-white rounded-2xl shadow-lg transition-all duration-300 cursor-not-allowed border border-gray-200 p-8 opacity-60">
            <div className="mb-6">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM7 3H5a2 2 0 00-2 2v12a4 4 0 004 4h2a2 2 0 002-2V5a2 2 0 00-2-2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-500 mb-3">Adjectives</h2>
              <p className="text-gray-500 leading-relaxed">
                Explore descriptive words and their relationships. Understand how qualities, properties, and attributes are organized.
              </p>
            </div>
            <div className="flex items-center justify-center text-gray-400 font-medium">
              Coming Soon
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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