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

        {/* Mode Selection */}
        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Graph Mode */}
          <div 
            onClick={() => router.push('/graph')}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 p-8 group"
          >
            <div className="mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-200 transition-colors">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Graph Mode</h2>
              <p className="text-gray-600 leading-relaxed">
                Visualize and explore lexical relationships through interactive network graphs. Perfect for understanding connections and discovering related entries.
              </p>
            </div>
            <div className="flex items-center justify-center text-blue-600 font-medium group-hover:text-blue-700">
              Explore Relationships
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>

          {/* Table Mode */}
          <div 
            onClick={() => router.push('/table')}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-gray-200 hover:border-green-300 p-8 group"
          >
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-green-200 transition-colors">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Table Mode</h2>
              <p className="text-gray-600 leading-relaxed">
                Browse, search, and filter through comprehensive data tables. Ideal for detailed analysis and systematic exploration of the database.
              </p>
            </div>
            <div className="flex items-center justify-center text-green-600 font-medium group-hover:text-green-700">
              Browse Database
              <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-sm text-gray-500">
          Choose your preferred interface to begin exploring the lexical database
        </div>
      </div>
    </div>
  );
}