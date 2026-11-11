import {
  accountClient,
  json,
  validOrigin,
} from "../../../../lib/account-server";
import { validRecord } from "../../../../lib/search-record";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const client = await accountClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return json({ error: "Sign in to view your saved searches." }, 401);
    const { data, error } = await client
      .from("search_history")
      .select("id,name,payload,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error)
      return json(
        { error: "Saved searches are unavailable. Please retry later." },
        503,
      );
    return json({ records: data });
  } catch {
    return json({ error: "Saved searches are temporarily unavailable." }, 503);
  }
}
export async function POST(request: Request) {
  if (!validOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  try {
    const client = await accountClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return json({ error: "Sign in to save searches." }, 401);
    const text = await request.text();
    if (text.length > 100000)
      return json({ error: "Search record is too large." }, 413);
    const { name, payload } = JSON.parse(text);
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      !validRecord(payload)
    )
      return json({ error: "Invalid search record." }, 400);
    const { data, error } = await client
      .from("search_history")
      .insert({ user_id: user.id, name: name.trim(), payload })
      .select("id")
      .single();
    return error
      ? json({ error: "Search was not saved. Please retry." }, 503)
      : json({ id: data.id }, 201);
  } catch {
    return json({ error: "Unable to save this search." }, 503);
  }
}
export async function DELETE(request: Request) {
  if (!validOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  try {
    const client = await accountClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return json({ error: "Sign in first." }, 401);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
      return json({ error: "Invalid search ID." }, 400);
    const { error } = await client
      .from("search_history")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    return error
      ? json({ error: "Could not delete this search." }, 503)
      : json({ ok: true });
  } catch {
    return json({ error: "Unable to delete this search." }, 503);
  }
}
