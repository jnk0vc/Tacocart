import { ensureOrder } from "@/lib/checkout";
import { errorMessage, json, preflight } from "@/lib/http";
import { resolveReturnUrls } from "@/lib/paypal-order";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  if (!body || typeof body.sessionId !== "string") return json({ error: "sessionId is required." }, 400);
  const session = getSession(body.sessionId);
  if (!session) return json({ error: "Session not found." }, 404);
  if (!session.cart) return json({ error: "Build a cart in the chat before paying." }, 400);
  try {
    const order = await ensureOrder(session, resolveReturnUrls(request.headers.get("origin")));
    return json({
      order,
      id: order.id,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 502);
  }
}

export function OPTIONS() {
  return preflight();
}
