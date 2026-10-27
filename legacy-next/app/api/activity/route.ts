import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { describeSignInDevice, ensureActivityTable, recordSignInActivity } from "@/lib/activity";

export async function GET() {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    await ensureActivityTable();
    const userAgent = session.session.userAgent || requestHeaders.get("user-agent");
    await recordSignInActivity(
      session.user.id,
      session.session.id,
      session.user.name || session.user.email,
      describeSignInDevice(userAgent),
    );
    const { rows } = await db.query(
      `SELECT id, actor_label AS "actorLabel", action, summary, created_at AS "createdAt"
       FROM activity_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [session.user.id],
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Activity GET failed:", error);
    return NextResponse.json({ error: "Could not load history." }, { status: 500 });
  }
}
