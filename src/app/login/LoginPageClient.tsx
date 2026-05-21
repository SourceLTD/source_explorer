'use client'

import { Suspense, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { login } from './actions'
import LoadingSpinner from '@/components/LoadingSpinner'

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
          <LoadingSpinner size="sm" className="mr-3 text-white" noPadding />
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

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const email = searchParams.get('email') ?? ''
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
                defaultValue={email}
                key={email}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter your email address"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                {error}
              </div>
            )}

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

function LoadingFallback() {
  return (
    <div className="h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="max-w-md mx-auto px-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/2 mx-auto mb-8" />
          <div className="h-12 bg-gray-200 rounded mb-6" />
          <div className="h-12 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  )
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginForm />
    </Suspense>
  )
}
