'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string

  if (!email) {
    console.error('No email provided')
    redirect('/error')
  }

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/confirm`
  console.log('Sending magic link to:', email)
  console.log('NEXT_PUBLIC_SITE_URL env var:', process.env.NEXT_PUBLIC_SITE_URL)
  console.log('Redirect URL:', redirectTo)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  })

  if (error) {
    console.error('Magic link error:', error.message)
    redirect('/error')
  }

  console.log('Magic link sent successfully')
  // Redirect to a page that tells the user to check their email
  redirect('/auth/check-email')
}

