import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Check if Supabase environment variables are properly configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('<your_') || supabaseKey.includes('<your_')) {
    // Environment variables not configured, skip auth middleware
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

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  let user = null
  try {
    const response = await supabase.auth.getUser()
    user = response.data.user
    
    // If we got an error but no user, check if it's a known/expected error
    if (!user && response.error) {
      const errorName = response.error.name || ''
      const errorMessage = response.error.message || ''
      
      // These are expected errors for unauthenticated users - don't log them
      const isExpectedError = 
        errorName === 'AuthSessionMissingError' ||
        errorMessage.includes('Auth session missing') ||
        errorMessage.includes('refresh_token_not_found')
      
      if (!isExpectedError) {
        console.error('Auth error:', response.error)
      }
    }
  } catch (error) {
    // Catch any unexpected errors
    console.error('Unexpected error in auth middleware:', error)
  }

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/auth/confirm', '/auth/verify', '/auth/check-email', '/error']
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))
  
  // Allow all API routes without authentication
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // Redirect unauthenticated users to login (except for public routes and API routes)
  if (!user && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login page
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object instead of the supabaseResponse object

  return supabaseResponse
}
