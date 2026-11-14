import {
  accountClient,
  json,
  validOrigin,
} from "../../../../lib/account-server";
import { validSnapshot } from "../../../../lib/saved-mission";
import { validRecord } from "../../../../lib/search-record";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const client = await accountClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return json({ error: "Sign in to view your saved missions." }, 401);
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid mission ID." }, 400);
      const { data, error } = await client.from("search_history")
        .select("payload,snapshot").eq("id", id).eq("user_id", user.id).maybeSingle();
      if (error) return json({ error: "Could not open this mission. Please retry." }, 503);
      if (!data || !validRecord(data.payload) || !validSnapshot(data.snapshot, data.payload))
        return json({ error: "Saved mission result unavailable." }, 404);
      return json({ record: data.payload, snapshot: data.snapshot });
    }
    const { data, error } = await client
      .from("search_history")
      .select("id,name,payload,created_at,has_snapshot")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error)
      return json(
        { error: "Saved missions are unavailable. Please retry later." },
        503,
      );
    return json({ records: data });
  } catch {
    return json({ error: "Saved missions are temporarily unavailable." }, 503);
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
    if (!user) return json({ error: "Sign in to save missions." }, 401);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 900000)
      return json({ error: "Search record is too large." }, 413);
    const { name, payload, snapshot } = JSON.parse(text);
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      !validRecord(payload) ||
      (snapshot !== undefined && !validSnapshot(snapshot, payload))
    )
      return json({ error: "Invalid search record." }, 400);
    const { data, error } = await client
      .from("search_history")
      .insert({ user_id: user.id, name: name.trim(), payload, snapshot })
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
