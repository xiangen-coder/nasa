import { accountClient, json, validOrigin } from "../../../lib/account-server";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await accountClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    const username = user?.user_metadata?.username;
    return json({
      user: user
        ? {
            id: user.id,
            email: user.email,
            username:
              (typeof username === "string" ? username.trim().slice(0, 32) : "") ||
              user.email?.split("@")[0]?.slice(0, 32) ||
              "Explorer",
          }
        : null,
    });
  } catch {
    return json({ error: "Account service is temporarily unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  if (!validOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  try {
    const body = await request.json();
    const client = await accountClient();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const site = process.env.SITE_URL || new URL(request.url).origin;
    if (body.action === "logout") {
      const { error } = await client.auth.signOut();
      return error
        ? json({ error: "Could not sign out. Please retry." }, 502)
        : json({ ok: true });
    }
    if (body.action === "update-password") {
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user)
        return json({ error: "Sign in using the recovery email first." }, 401);
      if (password.length < 8 || password.length > 128)
        return json({ error: "Use a password of 8–128 characters." }, 400);
      const { error } = await client.auth.updateUser({ password });
      return error
        ? json({ error: error.message }, 400)
        : json({ ok: true, message: "Password updated." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return json({ error: "Enter a valid email address." }, 400);
    if (body.action === "reset") {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${site}/auth/callback?recovery=1`,
      });
      return error
        ? json({ error: error.message }, 400)
        : json({
            ok: true,
            message:
              "If this account exists, a recovery email will arrive shortly.",
          });
    }
    if (!["login", "signup"].includes(body.action))
      return json({ error: "Unknown account action." }, 400);
    if (password.length < 8 || password.length > 128)
      return json({ error: "Use a password of 8–128 characters." }, 400);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (body.action === "signup" && (username.length < 2 || username.length > 32))
      return json({ error: "Use a username of 2–32 characters." }, 400);
    const result =
      body.action === "signup"
        ? await client.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${site}/auth/callback`,
              data: { username },
            },
          })
        : await client.auth.signInWithPassword({ email, password });
    if (result.error) return json({ error: result.error.message }, 400);
    return json({
      ok: true,
      message:
        body.action === "signup" && !result.data.session
          ? "Check your email to confirm your account, then sign in."
          : "Signed in.",
    });
  } catch {
    return json(
      { error: "Unable to complete account request. Please retry." },
      503,
    );
  }
}
