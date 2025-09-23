import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('<your_') || supabaseKey.includes('<your_')) {
    throw new Error('Supabase environment variables are not configured. Please update your .env file with your actual Supabase credentials.')
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseKey
  )
}
