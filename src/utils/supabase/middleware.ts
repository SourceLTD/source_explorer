import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith('sb-') && name.includes('-auth-token'))
    .forEach(({ name }) => {
      response.cookies.set(name, '', { maxAge: 0 })
    })
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('<your_') || supabaseKey.includes('<your_')) {
    console.warn('Supabase environment variables not configured. Skipping authentication middleware.')
    return supabaseResponse
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const publicRoutes = ['/login', '/auth/confirm', '/auth/verify', '/auth/check-email', '/error']
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // Always refresh the session before route checks. Skipping getUser() breaks
  // cookie refresh and can leave users stuck on /login after OTP verification.
  let user = null
  try {
    const response = await supabase.auth.getUser()
    user = response.data.user

    if (!user && response.error) {
      const errorName = response.error.name || ''
      const errorMessage = response.error.message || ''

      const isExpectedError =
        errorName === 'AuthSessionMissingError' ||
        errorMessage.includes('Auth session missing') ||
        errorMessage.includes('refresh_token_not_found')

      if (!isExpectedError) {
        console.error('Auth error in middleware:', response.error)

        if (errorMessage.includes('invalid JWT') || errorMessage.includes('token is expired')) {
          clearSupabaseAuthCookies(request, supabaseResponse)
        }
      }
    }
  } catch (error) {
    console.error('Unexpected error in auth middleware:', error)
  }

  if (!user && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname.startsWith('/auth/verify'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/graph/concepts'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
