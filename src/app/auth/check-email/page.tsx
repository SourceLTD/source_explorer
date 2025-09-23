export default function CheckEmailPage() {
  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md mx-auto px-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Check your email
            </h2>
            <p className="text-gray-600 mb-4">
              We've sent you a secure sign-in link. Click the link in your email to continue.
            </p>
            <p className="text-sm text-gray-500">
              The link will expire in 1 hour for security reasons.
            </p>
          </div>
          
          <div className="space-y-4">
            <a
              href="/login"
              className="block w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Send another link
            </a>
            
            <a
              href="/"
              className="block w-full text-indigo-600 py-3 px-4 rounded-lg font-medium hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
