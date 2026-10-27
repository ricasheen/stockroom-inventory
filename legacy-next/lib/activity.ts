import { db } from "@/lib/db";

export async function ensureActivityTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      session_id TEXT,
      actor_label TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS session_id TEXT");
  await db.query("CREATE INDEX IF NOT EXISTS activity_user_created_idx ON activity_log (user_id, created_at DESC)");
  await db.query("CREATE UNIQUE INDEX IF NOT EXISTS activity_one_signin_per_session_idx ON activity_log (user_id, session_id) WHERE action = 'Signed in' AND session_id IS NOT NULL");
}

export async function recordActivity(userId: string, actorLabel: string, action: string, summary: string) {
  await db.query(
    "INSERT INTO activity_log (user_id, actor_label, action, summary) VALUES ($1, $2, $3, $4)",
    [userId, actorLabel, action, summary],
  );
}

export function describeSignInDevice(userAgent?: string | null) {
  if (!userAgent) return "Device information was not provided by the browser.";
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /OPR\//.test(userAgent) ? "Opera"
    : /(?:Chrome|CriOS)\//.test(userAgent) ? "Chrome"
    : /Safari\//.test(userAgent) ? "Safari"
    : "Unknown browser";
  const system = /Windows NT/i.test(userAgent) ? "Windows"
    : /Android/i.test(userAgent) ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent) ? "iOS"
    : /Mac OS X/i.test(userAgent) ? "macOS"
    : /Linux/i.test(userAgent) ? "Linux"
    : "unknown system";
  const device = /iPad|Tablet/i.test(userAgent) ? "Tablet"
    : /Mobile|iPhone|Android/i.test(userAgent) ? "Mobile"
    : "Desktop";
  return `Used ${browser} on ${system} (${device}).`;
}

export async function recordSignInActivity(userId: string, sessionId: string, actorLabel: string, summary: string) {
  await db.query(
    `INSERT INTO activity_log (user_id, session_id, actor_label, action, summary)
     VALUES ($1, $2, $3, 'Signed in', $4)
     ON CONFLICT (user_id, session_id) WHERE action = 'Signed in' AND session_id IS NOT NULL DO NOTHING`,
    [userId, sessionId, actorLabel, summary],
  );
}
