import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureActivityTable, recordActivity } from "@/lib/activity";

async function signedInUser() {
  return auth.api.getSession({ headers: await headers() });
}

async function ensureProductsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Uncategorized',
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
      reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, sku)
    )
  `);
}

const productFields = `
  id, name, sku, category, quantity, price::float8 AS price,
  reorder_level AS "reorderLevel"
`;

export async function GET() {
  try {
    const session = await signedInUser();
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    await ensureProductsTable();
    const { rows } = await db.query(
      `SELECT ${productFields} FROM products WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Products GET failed:", error);
    return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await signedInUser();
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    await ensureProductsTable();

    const product = parseProduct(await request.json());
    if (!product) return NextResponse.json({ error: "Enter valid product details and stock values." }, { status: 400 });
    await ensureActivityTable();
    const { rows } = await db.query(
      `INSERT INTO products (user_id, name, sku, category, quantity, price, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${productFields}`,
      [userId, product.name, product.sku, product.category || "Uncategorized", product.quantity, product.price, product.reorderLevel],
    );
    await recordActivity(userId, session.user.name || session.user.email, "Product added", `Added ${product.name} with ${product.quantity} item(s) in stock.`);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "That product code is already in your inventory." }, { status: 409 });
    console.error("Products POST failed:", error);
    return NextResponse.json({ error: "Could not save product." }, { status: 500 });
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function parseProduct(value: unknown): ProductInput | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 19) return null;
  if (typeof input.sku !== "string" || !input.sku.trim() || input.sku.trim().length > 80) return null;
  if (typeof input.category !== "string" || input.category.trim().length > 19) return null;
  if (!Number.isInteger(input.quantity) || Number(input.quantity) < 0) return null;
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 0) return null;
  if (!Number.isInteger(input.reorderLevel) || Number(input.reorderLevel) < 0) return null;
  return {
    name: input.name.trim(),
    sku: input.sku.trim(),
    category: input.category.trim() || "Uncategorized",
    quantity: Number(input.quantity),
    price: input.price,
    reorderLevel: Number(input.reorderLevel),
  };
}

type ProductInput = {
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number;
  reorderLevel: number;
};
