import { ChatError, handleChat } from "@/lib/agent";
import { errorMessage, json, preflight } from "@/lib/http";
import { resolveReturnUrls } from "@/lib/paypal-order";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    sessionId?: unknown;
    recipeId?: unknown;
    message?: unknown;
    locale?: unknown;
  } | null;
  if (!body || typeof body.recipeId !== "string" || typeof body.message !== "string") {
    return json({ error: "recipeId and message are required." }, 400);
  }
  const urls = resolveReturnUrls(request.headers.get("origin"));
  try {
    const result = await handleChat({
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      recipeId: body.recipeId,
      message: body.message,
      locale: body.locale === "ja" ? "ja" : "en",
      returnUrl: urls.returnUrl,
      cancelUrl: urls.cancelUrl,
    });
    return json(result);
  } catch (error) {
    const status = error instanceof ChatError ? error.status : 500;
    if (status === 500) console.error("[tacocart] chat", error);
    return json({ error: errorMessage(error) }, status);
  }
}

export function OPTIONS() {
  return preflight();
}
