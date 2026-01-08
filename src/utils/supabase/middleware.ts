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

  // Define public routes that don't require authentication
  const publicRoutes = ['/login', '/auth/confirm', '/auth/verify', '/auth/check-email', '/error']
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route))
  
  // Allow all API routes without authentication
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

  // Optimization: skip getUser() for API routes and public routes if we don't need user context
  if (isApiRoute || isPublicRoute) {
    return supabaseResponse
  }

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
        console.error('Auth error in middleware:', response.error)
        
        // If it's a bad JWT (expired), we should try to clear the session cookies
        // so the client doesn't keep sending them.
        if (errorMessage.includes('invalid JWT') || errorMessage.includes('token is expired')) {
          console.log('Clearing invalid/expired session cookies');
          const cookieNames = ['sb-txyvapnclxnwpiifbxmu-auth-token', 'supabase-auth-token'];
          cookieNames.forEach(name => {
            supabaseResponse.cookies.set(name, '', { maxAge: 0 });
          });
        }
      }
    }
  } catch (error) {
    // Catch any unexpected errors
    console.error('Unexpected error in auth middleware:', error)
  }

  // Redirect unauthenticated users to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
