import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureActivityTable, recordActivity } from "@/lib/activity";

type Context = { params: Promise<{ id: string }> };

async function signedInUser() {
  return auth.api.getSession({ headers: await headers() });
}

const productFields = `id, name, sku, category, quantity, price::float8 AS price, reorder_level AS "reorderLevel"`;

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await signedInUser();
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    const { id } = await context.params;
    const product = parseProduct(await request.json());
    if (!product) return NextResponse.json({ error: "Enter valid product details and stock values." }, { status: 400 });
    const { rows: previousRows } = await db.query(
      "SELECT name, sku, category, quantity, price::float8 AS price, reorder_level AS \"reorderLevel\" FROM products WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    if (!previousRows[0]) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const previous = previousRows[0];
    const { rows } = await db.query(
      `UPDATE products SET name = $1, sku = $2, category = $3, quantity = $4, price = $5, reorder_level = $6
       WHERE id = $7 AND user_id = $8 RETURNING ${productFields}`,
      [product.name, product.sku, product.category || "Uncategorized", product.quantity, product.price, product.reorderLevel, id, userId],
    );
    if (!rows[0]) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const updated = rows[0];
    const changed: string[] = [];
    for (const field of ["name", "sku", "category", "quantity", "price", "reorderLevel"] as const) {
      if (String(previous[field]) !== String(updated[field])) changed.push(`${field}: ${previous[field]} → ${updated[field]}`);
    }
    await ensureActivityTable();
    await recordActivity(userId, session.user.name || session.user.email, "Product updated", changed.length ? `Updated ${updated.name}. ${changed.join("; ")}.` : `Saved ${updated.name}; no values changed.`);
    return NextResponse.json(rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: "That product code is already in your inventory." }, { status: 409 });
    console.error("Products PATCH failed:", error);
    return NextResponse.json({ error: "Could not update product." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await signedInUser();
    if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    const userId = session.user.id;
    const { id } = await context.params;
    const { rows: products } = await db.query("SELECT name FROM products WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!products[0]) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    const { rowCount } = await db.query("DELETE FROM products WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!rowCount) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    await ensureActivityTable();
    await recordActivity(userId, session.user.name || session.user.email, "Product removed", `Removed ${products[0].name} from inventory.`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Products DELETE failed:", error);
    return NextResponse.json({ error: "Could not remove product." }, { status: 500 });
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function parseProduct(value: unknown) {
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
