'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  let supabase
  try {
    supabase = await createClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication is not configured'
    console.error('Failed to create Supabase client:', message)
    redirect(`/login?error=${encodeURIComponent(message)}`)
  }

  const email = (formData.get('email') as string)?.trim()

  if (!email) {
    redirect(`/login?error=${encodeURIComponent('Email is required')}`)
  }

  const { error } = await supabase.auth.signInWithOtp({ email })

  if (error) {
    console.error('OTP send error:', error.message)
    redirect(
      `/login?error=${encodeURIComponent(error.message)}&email=${encodeURIComponent(email)}`,
    )
  }

  redirect(`/auth/verify?email=${encodeURIComponent(email)}`)
}

export async function verifyCode(email: string, token: string) {
  const supabase = await createClient()

  if (!email || !token) {
    console.error('Missing email or token for verification')
    redirect('/error')
  }

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })

  if (error) {
    console.error('OTP verification error:', error.message)
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

  const { error } = await supabase.auth.signInWithOtp({ email })

  if (error) {
    console.error('OTP resend error:', error.message)
    return { error: error.message }
  }

  return { success: true }
}
