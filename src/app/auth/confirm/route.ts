import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  console.log('Auth confirm - token_hash:', token_hash)
  console.log('Auth confirm - type:', type)
  console.log('Auth confirm - code:', code)
  console.log('Auth confirm - next:', next)

  const supabase = await createClient()

  // Handle different magic link formats
  if (token_hash && type) {
    // New format with token_hash and type
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      console.log('Magic link verified successfully (token_hash method)')
      redirect(next)
    } else {
      console.error('Magic link verification error (token_hash):', error.message)
    }
  } else if (code) {
    // Older format with code parameter - exchange code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      console.log('Magic link verified successfully (code method)')
      redirect(next)
    } else {
      console.error('Magic link verification error (code):', error.message)
    }
  } else {
    console.error('Missing authentication parameters in magic link')
  }

  // If we get here, something went wrong
  // redirect the user to an error page with some instructions
  redirect('/error')
}
