import { NextResponse } from "next/server";
import { accountClient } from "../../../lib/account-server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const site = process.env.SITE_URL || url.origin;
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const client = await accountClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(
          `${site}/${url.searchParams.get("recovery") === "1" ? "?recovery=1" : ""}#account`,
        );
    } catch {
      /* Return a visible, recoverable failure. */
    }
  }
  return NextResponse.redirect(`${site}/?auth_error=1#account`);
}
