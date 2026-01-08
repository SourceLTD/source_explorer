'use client'

import { createClient } from '@/utils/supabase/client'

interface SignOutButtonProps {
  className?: string
}

export default function SignOutButton({ className }: SignOutButtonProps) {
  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      onClick={handleSignOut}
      className={`inline-flex items-center rounded-xl bg-gray-100 text-gray-700 px-4 py-2.5 text-sm font-medium border border-gray-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors whitespace-nowrap ${className || ''}`}
    >
      Sign Out
    </button>
  )
}
