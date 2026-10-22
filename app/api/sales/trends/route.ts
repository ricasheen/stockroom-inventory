import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function ensureSalesTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name TEXT NOT NULL, sku TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Uncategorized',
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
      reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (user_id, sku)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name TEXT NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
      selling_price NUMERIC(12, 2) CHECK (selling_price >= 0),
      sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12, 2) CHECK (selling_price >= 0)");
}

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    await ensureSalesTable();
    const period = new URL(request.url).searchParams.get("period") === "week" ? "week" : "month";
    const steps = period === "week" ? 7 : 5;
    const interval = period === "week" ? "1 week" : "1 month";
    const labelExpression = period === "week"
      ? `to_char(p.period_start, 'Mon DD') || '–' || to_char(p.period_start + INTERVAL '6 days', 'Mon DD') || CASE WHEN EXTRACT(YEAR FROM p.period_start) <> EXTRACT(YEAR FROM p.period_start + INTERVAL '6 days') THEN ' ' || to_char(p.period_start + INTERVAL '6 days', 'YYYY') ELSE '' END`
      : `to_char(p.period_start, 'Mon YYYY')`;
    const { rows } = await db.query(
      `WITH periods AS (
         SELECT generate_series(
           date_trunc('${period}', NOW()) - INTERVAL '${steps} ${period}',
           date_trunc('${period}', NOW()), INTERVAL '${interval}'
         ) AS period_start
       )
       SELECT ${labelExpression} AS label,
              COALESCE(SUM(s.quantity), 0)::int AS "unitsSold",
              COALESCE(SUM(s.quantity * s.selling_price) FILTER (WHERE s.selling_price IS NOT NULL), 0)::float8 AS revenue,
              COALESCE(SUM(s.quantity * (s.selling_price - s.unit_price)) FILTER (WHERE s.selling_price IS NOT NULL), 0)::float8 AS "grossProfit"
       FROM periods p
       LEFT JOIN sales s ON s.user_id = $1 AND s.sold_at >= p.period_start
         AND s.sold_at < p.period_start + INTERVAL '${interval}'
       GROUP BY p.period_start ORDER BY p.period_start`,
      [session.user.id],
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Sales trends GET failed:", error);
    return NextResponse.json({ error: "Could not load sales trends." }, { status: 500 });
  }
}
