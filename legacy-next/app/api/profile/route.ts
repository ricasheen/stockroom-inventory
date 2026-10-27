import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureActivityTable, recordActivity } from "@/lib/activity";

async function signedInUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

async function ensureProfileTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL DEFAULT '',
      store_name TEXT NOT NULL DEFAULT '',
      image_data_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET() {
  try {
    const userId = await signedInUserId();
    if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    await ensureProfileTable();
    const { rows } = await db.query(
      `SELECT display_name AS "displayName", store_name AS "storeName", image_data_url AS "imageDataUrl"
       FROM user_profiles WHERE user_id = $1`,
      [userId],
    );
    return NextResponse.json(rows[0] ?? { displayName: "", storeName: "", imageDataUrl: "" });
  } catch (error) {
    console.error("Profile GET failed:", error);
    return NextResponse.json({ error: "Could not load your profile." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    const body = await request.json() as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const storeName = typeof body.storeName === "string" ? body.storeName.trim() : "";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
    if (displayName.length > 100 || storeName.length > 140) {
      return NextResponse.json({ error: "Name or store name is too long." }, { status: 400 });
    }
    const validImage = imageDataUrl === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(imageDataUrl);
    if (!validImage || imageDataUrl.length > 1_400_000) {
      return NextResponse.json({ error: "Choose a PNG, JPEG, or WebP image under 1 MB." }, { status: 400 });
    }
    await ensureProfileTable();
    await ensureActivityTable();
    const { rows: previousRows } = await db.query(
      "SELECT display_name, store_name, image_data_url FROM user_profiles WHERE user_id = $1",
      [userId],
    );
    const previous = previousRows[0] ?? { display_name: "", store_name: "", image_data_url: "" };
    const { rows } = await db.query(
      `INSERT INTO user_profiles (user_id, display_name, store_name, image_data_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name,
         store_name = EXCLUDED.store_name, image_data_url = EXCLUDED.image_data_url, updated_at = NOW()
       RETURNING display_name AS "displayName", store_name AS "storeName", image_data_url AS "imageDataUrl"`,
      [userId, displayName, storeName, imageDataUrl],
    );
    const changed: string[] = [];
    if (previous.display_name !== displayName) changed.push("profile name");
    if (previous.store_name !== storeName) changed.push("company or store name");
    if (previous.image_data_url !== imageDataUrl) changed.push("profile picture");
    if (changed.length) await recordActivity(userId, session.user.name || session.user.email, "Profile updated", `Changed ${changed.join(", ")}.`);
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error("Profile PATCH failed:", error);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }
}
