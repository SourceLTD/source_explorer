import Link from 'next/link';

export default function ErrorPage() {
  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-lg mx-auto px-6">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Authentication Error
            </h2>
            <div className="text-left bg-gray-50 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-gray-900 mb-2">Possible causes:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Verification code has expired (codes expire after 1 hour)</li>
                <li>• Verification code was entered incorrectly</li>
                <li>• Code has already been used</li>
                <li>• Email address not found in the system</li>
              </ul>
            </div>
            <div className="text-left bg-blue-50 rounded-xl p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">What to try:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Request a new verification code</li>
                <li>• Double-check you&apos;re entering the code correctly</li>
                <li>• Check your spam folder for the email</li>
                <li>• Make sure you&apos;re using the most recent code sent</li>
              </ul>
            </div>
          </div>
          
          <div className="space-y-3">
            <a
              href="/login"
              className="block w-full bg-indigo-600 text-white py-3 px-6 rounded-xl font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Try Again
            </a>
            <Link
              href="/"
              className="block w-full text-gray-600 py-3 px-6 rounded-xl font-medium hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
