import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureActivityTable } from "@/lib/activity";

async function ensureTables() {
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
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
      sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS selling_price NUMERIC(12, 2) CHECK (selling_price >= 0)");
  await db.query("CREATE INDEX IF NOT EXISTS sales_user_sold_at_idx ON sales (user_id, sold_at)");
}

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    await ensureTables();
    const period = new URL(request.url).searchParams.get("period") === "week" ? "week" : "month";
    const interval = period === "week" ? "1 week" : "1 month";
    const { rows } = await db.query(
      `SELECT product_id AS "productId", product_name AS "productName",
              SUM(quantity)::int AS "unitsSold",
              SUM(quantity * selling_price)::float8 AS revenue
       FROM sales WHERE user_id = $1 AND sold_at >= date_trunc('${period}', NOW())
         AND sold_at < date_trunc('${period}', NOW()) + INTERVAL '${interval}'
       GROUP BY product_id, product_name ORDER BY SUM(quantity) DESC, SUM(quantity * selling_price) DESC`,
      [userId],
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Sales GET failed:", error);
    return NextResponse.json({ error: "Could not load sales report." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const client = await db.connect();
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    const value = await request.json() as Record<string, unknown>;
    const productId = typeof value.productId === "string" ? value.productId : "";
    const quantity = value.quantity;
    const sellingPrice = value.sellingPrice;
    if (!productId || !Number.isInteger(quantity) || Number(quantity) < 1) {
      return NextResponse.json({ error: "Choose a product and enter a quantity of at least 1." }, { status: 400 });
    }
    if (typeof sellingPrice !== "number" || !Number.isFinite(sellingPrice) || sellingPrice < 0) {
      return NextResponse.json({ error: "Enter a valid selling price for each item." }, { status: 400 });
    }
    await ensureTables();
    await ensureActivityTable();
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id, name, quantity, price FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [productId, userId],
    );
    const product = rows[0];
    if (!product) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Product not found." }, { status: 404 }); }
    if (product.quantity < Number(quantity)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Not enough stock for that sale." }, { status: 409 }); }
    await client.query("UPDATE products SET quantity = quantity - $1 WHERE id = $2 AND user_id = $3", [quantity, productId, userId]);
    const { rows: saleRows } = await client.query(
      `INSERT INTO sales (user_id, product_id, product_name, quantity, unit_price, selling_price)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, productId, product.name, quantity, product.price, sellingPrice],
    );
    await client.query(
      `INSERT INTO activity_log (user_id, actor_label, action, summary)
       VALUES ($1, $2, $3, $4)`,
      [userId, session.user.name || session.user.email, "Sale recorded", `Sold ${quantity} of ${product.name} at ${sellingPrice.toFixed(2)} each; ${product.quantity - Number(quantity)} remaining.`],
    );
    await client.query("COMMIT");
    return NextResponse.json({ id: saleRows[0].id, remaining: product.quantity - Number(quantity) }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Sales POST failed:", error);
    return NextResponse.json({ error: "Could not record sale." }, { status: 500 });
  } finally {
    client.release();
  }
}
