'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'

export type LoginState = {
  error?: string
}

export async function login(
  _prevState: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  let supabase
  try {
    supabase = await createClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication is not configured'
    console.error('Failed to create Supabase client:', message)
    return { error: message }
  }

  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Email is required' }
  }

  // Send OTP code (no emailRedirectTo = sends 6-digit code instead of magic link)
  const { error } = await supabase.auth.signInWithOtp({ email })

  if (error) {
    console.error('OTP send error:', error.message)
    return { error: error.message }
  }

  redirect(`/auth/verify?email=${encodeURIComponent(email)}`)
}

export async function verifyCode(email: string, token: string) {
  const supabase = await createClient()

  if (!email || !token) {
    console.error('Missing email or token for verification')
    redirect('/error')
  }

  console.log('Verifying OTP code for:', email)

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    console.error('OTP verification error:', error.message)
    // Return error message instead of redirecting so user can retry
    return { error: error.message }
  }

  redirect('/graph/concepts')
}

export async function resendCode(email: string) {
  const supabase = await createClient()

  if (!email) {
    console.error('No email provided for resend')
    return { error: 'Email is required' }
  }

  console.log('Resending OTP code to:', email)

  const { error } = await supabase.auth.signInWithOtp({ email })

  if (error) {
    console.error('OTP resend error:', error.message)
    return { error: error.message }
  }

  console.log('OTP code resent successfully')
  return { success: true }
}

