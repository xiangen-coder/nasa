# Lunar accounts and search history

The Account view saves the current site, UTC mission window, sampling, clearance,
priority and chosen comparison points. Opening a record restores these inputs;
run the search to recalculate the result. The Mission Lab investigation library
stores separate learning plans in the current browser.

## Configure Supabase

1. Apply `supabase/migrations/202611110001_search_history.sql` once. The table
   grants signed-in users read, insert and delete access to their own rows only.
   This migration is already applied to the Lunar Navigator production project.
2. In [Authentication → URL Configuration](https://supabase.com/dashboard/project/plemkhlellfunwlkyovj/auth/url-configuration),
   set Site URL to `https://lunar-navigator-xiangen.onrender.com` and add these
   redirect URLs:
   - `https://lunar-navigator-xiangen.onrender.com/auth/callback`
   - `https://lunar-navigator-xiangen.onrender.com/auth/callback?recovery=1`
3. Keep the Email provider enabled. Configure
   [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) before opening
   signup to the public. Supabase's default mail service only sends to project
   team addresses. Use the same browser to open the confirmation or recovery
   link and complete the PKCE session exchange.

The Next.js server reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and
`SITE_URL` at runtime. Set these in Render; for `npm run dev`, put them in
`frontend/.env.local` and use the local origin as `SITE_URL`. Add the matching
local callback URLs to Supabase if testing email flows locally. No service-role
key is needed. The app stores sessions in HttpOnly cookies and validates each
private request with Supabase Auth. Analysis remains available without an account.
