import { login } from './actions'

export default function LoginPage() {
  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md mx-auto px-6">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Sign In with Magic Link
            </h1>
            <p className="text-gray-600">
              Enter your email to receive a secure sign-in link
            </p>
          </div>
          
          <form className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="Enter your email address"
              />
            </div>

            <button
              formAction={login}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Send Magic Link
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              We&apos;ll send you a secure link to sign in without a password
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
