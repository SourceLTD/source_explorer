'use client'

import { useState, useEffect } from 'react'
import { useFormStatus } from 'react-dom'
import { login } from './actions'

const COOLDOWN_SECONDS = 15

function SubmitButton({ cooldown, setCooldown }: { cooldown: number, setCooldown: (v: number) => void }) {
  const { pending } = useFormStatus()
  
  useEffect(() => {
    if (pending && cooldown === 0) {
      setCooldown(COOLDOWN_SECONDS)
    }
  }, [pending, cooldown, setCooldown])

  const isDisabled = pending || cooldown > 0

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
    >
      {pending ? (
        <>
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sending...
        </>
      ) : cooldown > 0 ? (
        `Wait ${cooldown}s`
      ) : (
        'Send Code'
      )}
    </button>
  )
}

export default function LoginPage() {
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md mx-auto px-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Sign in
            </h1>
          </div>
          
          <form action={login} className="space-y-6">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter your email address"
              />
            </div>

            <SubmitButton cooldown={cooldown} setCooldown={setCooldown} />
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              We&apos;ll send you a 6-digit code to sign in without a password
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
