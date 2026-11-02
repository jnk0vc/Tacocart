import { captureSessionOrder } from "@/lib/checkout";
import { paidReply } from "@/lib/copy";
import { errorMessage, json, preflight } from "@/lib/http";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  if (!body || typeof body.sessionId !== "string") return json({ error: "sessionId is required." }, 400);
  const session = getSession(body.sessionId);
  if (!session) return json({ error: "Session not found." }, 404);
  try {
    const capture = await captureSessionOrder(session, orderId);
    const reply = paidReply(session.locale, orderId, capture.id);
    session.messages.push({ role: "assistant", content: reply });
    return json({
      reply,
      capture,
      order: session.order ? { id: session.order.id, status: session.order.status, mock: session.order.mock } : null,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 402);
  }
}

export function OPTIONS() {
  return preflight();
}
