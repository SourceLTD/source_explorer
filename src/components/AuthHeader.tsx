'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import type { User } from '@supabase/supabase-js'
import ChatButton from '@/components/ChatButton'

export default function AuthHeader() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()
    
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (pathname?.startsWith('/login') || pathname?.startsWith('/auth') || pathname?.startsWith('/error')) {
    return null
  }

  if (loading) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <div className="animate-pulse bg-gray-200 rounded-xl px-4 py-2 w-20 h-10"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const isCustomHeader = pathname?.startsWith('/graph') || pathname?.startsWith('/table') || pathname?.startsWith('/frames')
  
  if (isCustomHeader) {
    return null
  }

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-2">
      <ChatButton />
      <button
        onClick={handleSignOut}
        className="inline-flex items-center rounded-xl bg-gray-100 text-gray-700 px-4 py-2 text-sm font-medium border border-gray-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors whitespace-nowrap"
      >
        Sign Out
      </button>
    </div>
  )
}
