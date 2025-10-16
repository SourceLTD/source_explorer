# Vercel Deployment Guide

This project is ready for deployment on Vercel. Follow these steps to deploy successfully.

## Prerequisites

1. A Vercel account (https://vercel.com)
2. A PostgreSQL database (Supabase recommended)
3. Supabase account for authentication (optional but recommended)

## Deployment Steps

### 1. Prepare Your Database

**Option A: Supabase (Recommended)**
1. Create a new project at https://supabase.com
2. Go to Settings > Database and note your connection strings
3. Run the `schema.sql` file in the SQL Editor to set up your database schema

**Option B: Other PostgreSQL Provider**
1. Create a PostgreSQL database with your preferred provider
2. Run the `schema.sql` file to set up your database schema

### 2. Deploy to Vercel

1. **Connect Repository**
   - Go to https://vercel.com and click "New Project"
   - Import your repository from GitHub/GitLab/Bitbucket

2. **Configure Environment Variables**
   In your Vercel project settings, add these environment variables:

   ```bash
   # Database Configuration (Required)
   POSTGRES_PRISMA_URL=your_database_connection_string
   POSTGRES_URL_NON_POOLING=your_direct_database_connection_string
   
   # Supabase Authentication (Required for auth features)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   
   # Site URL (Update with your actual domain after deployment)
   NEXT_PUBLIC_SITE_URL=https://your-vercel-app.vercel.app
   ```

3. **Deploy**
   - Click "Deploy" - Vercel will automatically:
     - Install dependencies
     - Generate Prisma client
     - Build the Next.js application
     - Deploy to a global CDN

### 3. Post-Deployment

1. **Update Site URL**
   - After deployment, update `NEXT_PUBLIC_SITE_URL` with your actual Vercel domain in Vercel environment variables
   
2. **Configure Supabase Authentication URLs** (CRITICAL for magic links)
   - Go to your Supabase Dashboard → Authentication → URL Configuration
   - Set **Site URL** to your production URL (e.g., `https://your-app.vercel.app`)
   - Add to **Redirect URLs**:
     - `https://your-app.vercel.app/auth/confirm` (production)
     - `http://localhost:3000/auth/confirm` (local development)
   - Without these settings, magic links will redirect to localhost even in production!

3. **Seed Database (Optional)**
   - You can run the seed script locally: `npm run db:seed`
   - Or add sample data through your database provider's interface

## Build Configuration

The project is configured with:

- ✅ **Prisma Client Generation**: Automatically runs during build
- ✅ **TypeScript**: Fully typed with strict mode
- ✅ **ESLint**: Clean code with no warnings
- ✅ **Next.js 15**: Latest version with Turbopack
- ✅ **Node.js 18+**: Specified in package.json engines

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_PRISMA_URL` | Primary database connection | `postgresql://user:pass@host:5432/db` |
| `POSTGRES_URL_NON_POOLING` | Direct database connection | `postgresql://user:pass@host:5432/db` |

### Authentication Variables (if using auth features)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `NEXT_PUBLIC_SITE_URL` | Your site URL | `https://myapp.vercel.app` |

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify database connection strings are correct

### Runtime Errors
- Check function logs in Vercel dashboard
- Verify database is accessible from Vercel's servers
- Ensure Prisma client is properly generated

### Database Connection Issues
- Verify your database allows connections from Vercel's IP ranges
- Check if your database provider requires SSL (most do)
- Ensure connection strings include proper SSL parameters

### Magic Link Redirects to Localhost
If magic links redirect to localhost in production:
1. Verify `NEXT_PUBLIC_SITE_URL` is set in Vercel environment variables
2. **Most importantly**: Go to Supabase Dashboard → Authentication → URL Configuration
3. Update **Site URL** to your production domain
4. Add your production `/auth/confirm` URL to **Redirect URLs**
5. Redeploy your app after making these changes (or wait for cache to clear)

## Support

- Vercel Documentation: https://vercel.com/docs
- Next.js Documentation: https://nextjs.org/docs
- Prisma Documentation: https://www.prisma.io/docs
- Supabase Documentation: https://supabase.com/docs
