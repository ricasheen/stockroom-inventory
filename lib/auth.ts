import { betterAuth } from "better-auth";
import { db } from "@/lib/db";
import { describeSignInDevice, ensureActivityTable, recordSignInActivity } from "@/lib/activity";

export const auth = betterAuth({
  appName: "Stockroom",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            await ensureActivityTable();
            const { rows } = await db.query('SELECT name, email FROM "user" WHERE id = $1', [session.userId]);
            const actor = rows[0]?.name || rows[0]?.email || session.userId;
            await recordSignInActivity(session.userId, session.id, actor, describeSignInDevice(session.userAgent));
          } catch (error) {
            console.error("Could not record sign-in history:", error);
          }
        },
      },
    },
  },
});
