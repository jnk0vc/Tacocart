import { generateText, tool } from "ai";
import { z } from "zod";
import { buildCart } from "@/lib/cart";
import { ensureOrder, paypalIsMock } from "@/lib/checkout";
import { alreadyPaidReply, guideReply, shopReply } from "@/lib/copy";
import { planRefund, planShipmentLookup, refundReply, trackingReply } from "@/lib/flows";
import { detectIntent, type Intent } from "@/lib/intent";
import { getLanguageModel, hasLlmCredentials } from "@/lib/llm";
import { getPayPalGateway } from "@/lib/paypal";
import { getRecipe } from "@/lib/recipes";
import { scaleRecipe } from "@/lib/scale";
import { getOrCreateSession } from "@/lib/session";
import type { Locale, PendingTool, PublicCapture, PublicOrder, Recipe, Session, Spice } from "@/lib/types";

export type ChatInput = {
  sessionId?: string;
  recipeId: string;
  message: string;
  locale?: Locale;
  returnUrl: string;
  cancelUrl: string;
};

export type ChatResult = {
  sessionId: string;
  reply: string;
  locale: Locale;
  mode: "agent" | "fallback";
  flow: "shop" | "tracking_stub" | "refund_stub" | "chat";
  cart: Session["cart"] | null;
  order: PublicOrder | null;
  capture: PublicCapture | null;
  pendingAction: PendingTool | null;
  suggestions: string[];
};

export class ChatError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function handleChat(input: ChatInput): Promise<ChatResult> {
  const recipe = getRecipe(input.recipeId);
  if (!recipe) throw new ChatError("Recipe not found.", 404);
  const message = input.message.trim();
  if (!message) throw new ChatError("Message is required.", 400);
  if (message.length > 2000) throw new ChatError("Message is too long.", 400);

  const locale: Locale = input.locale === "ja" ? "ja" : "en";
  let session: Session;
  try {
    session = getOrCreateSession(input.sessionId, recipe.id, locale);
  } catch (error) {
    throw new ChatError(error instanceof Error ? error.message : "Invalid session.", 409);
  }
  session.locale = locale;
  session.messages.push({ role: "user", content: message });
  if (session.messages.length > 40) session.messages.splice(0, session.messages.length - 40);

  const intent = detectIntent(message, session);
  const urls = { returnUrl: input.returnUrl, cancelUrl: input.cancelUrl };
  const turn = await runTurn(session, recipe, intent, locale, urls);
  session.messages.push({ role: "assistant", content: turn.reply });

  return {
    sessionId: session.id,
    reply: turn.reply,
    locale,
    mode: turn.mode,
    flow: turn.flow,
    cart: session.cart ?? null,
    order: publicOrder(session),
    capture: session.capture ?? null,
    pendingAction: turn.pendingAction,
    suggestions: suggestionsFor(locale, turn.flow),
  };
}

function publicOrder(session: Session): PublicOrder | null {
  if (!session.order) return null;
  return { id: session.order.id, status: session.order.status, mock: session.order.mock };
}

function suggestionsFor(locale: Locale, flow: ChatResult["flow"]): string[] {
  if (locale === "ja") {
    if (flow === "shop") return ["いつ届きますか？", "1つ返品したい"];
    return ["4人分、辛さ控えめ", "2人分のまま、辛口"];
  }
  if (flow === "shop") return ["When will it arrive?", "I want to return one item"];
  return ["Make this for 4 people, mild spice", "Keep it for 2, but make it hot"];
}

type Turn = {
  reply: string;
  mode: "agent" | "fallback";
  flow: ChatResult["flow"];
  pendingAction: PendingTool | null;
};

async function runTurn(
  session: Session,
  recipe: Recipe,
  intent: Intent,
  locale: Locale,
  urls: { returnUrl: string; cancelUrl: string },
): Promise<Turn> {
  if (intent.type === "tracking") {
    return {
      reply: trackingReply(session, locale),
      mode: "fallback",
      flow: "tracking_stub",
      pendingAction: planShipmentLookup(session),
    };
  }
  if (intent.type === "refund") {
    return {
      reply: refundReply(session, locale, intent.itemHint),
      mode: "fallback",
      flow: "refund_stub",
      pendingAction: planRefund(session, intent.itemHint),
    };
  }
  if (session.capture && intent.type === "shop") {
    return { reply: alreadyPaidReply(locale, session.capture.orderId), mode: "fallback", flow: "chat", pendingAction: null };
  }
  if (!hasLlmCredentials()) {
    if (intent.type === "shop") return shopFromIntent(session, recipe, intent, locale, urls, "fallback");
    return { reply: guideReply(locale), mode: "fallback", flow: "chat", pendingAction: null };
  }

  try {
    const text = await runAgent(session, recipe, locale, urls);
    if (intent.type === "shop" && !session.cart) {
      const filled = await shopFromIntent(session, recipe, intent, locale, urls, "agent");
      return { ...filled, reply: text && text.length > 40 ? text : filled.reply };
    }
    if (intent.type === "shop" && session.cart && !session.order) {
      try {
        await ensureOrder(session, urls);
      } catch (error) {
        const orderError = error instanceof Error ? error.message : "PayPal order creation failed.";
        return { reply: composedShopReply(session, recipe, locale, orderError), mode: "agent", flow: "shop", pendingAction: null };
      }
    }
    if (session.cart && session.scaled && (!text || text.length < 20)) {
      return { reply: composedShopReply(session, recipe, locale), mode: "agent", flow: "shop", pendingAction: null };
    }
    return { reply: text || guideReply(locale), mode: "agent", flow: session.cart ? "shop" : "chat", pendingAction: null };
  } catch (error) {
    console.error("[tacocart] agent failed", error);
    if (intent.type === "shop") return shopFromIntent(session, recipe, intent, locale, urls, "fallback");
    return { reply: guideReply(locale), mode: "fallback", flow: "chat", pendingAction: null };
  }
}

async function shopFromIntent(
  session: Session,
  recipe: Recipe,
  intent: Extract<Intent, { type: "shop" }>,
  locale: Locale,
  urls: { returnUrl: string; cancelUrl: string },
  mode: "agent" | "fallback",
): Promise<Turn> {
  const servings = intent.servings ?? session.scaled?.servings ?? recipe.baseServings;
  const spice = intent.spice ?? session.scaled?.spice ?? recipe.defaultSpice;
  applyScaleAndCart(session, recipe, servings, spice, intent.omitTools || Boolean(session.omitTools));
  let orderError: string | undefined;
  try {
    await ensureOrder(session, urls);
  } catch (error) {
    orderError = error instanceof Error ? error.message : "PayPal order creation failed.";
  }
  return { reply: composedShopReply(session, recipe, locale, orderError), mode, flow: "shop", pendingAction: null };
}

function composedShopReply(session: Session, recipe: Recipe, locale: Locale, orderError?: string): string {
  return shopReply({
    locale,
    recipe,
    scaled: session.scaled!,
    cart: session.cart!,
    order: publicOrder(session) ?? undefined,
    orderError,
    mock: session.order?.mock ?? paypalIsMock(),
  });
}

export function applyScaleAndCart(
  session: Session,
  recipe: Recipe,
  servings: number,
  spice: Spice,
  omitTools: boolean,
): void {
  session.omitTools = omitTools;
  session.scaled = scaleRecipe(recipe, servings, spice);
  session.cart = buildCart(session.scaled, { omitTools });
  if (session.order && session.order.fingerprint !== session.cart.fingerprint && session.order.status === "CREATED") {
    session.order = undefined;
  }
}

async function runAgent(
  session: Session,
  recipe: Recipe,
  locale: Locale,
  urls: { returnUrl: string; cancelUrl: string },
): Promise<string> {
  const ingredientList = recipe.ingredients
    .map((ingredient) => `${ingredient.name.en} (${ingredient.quantity} ${ingredient.unit}${ingredient.pantry ? ", pantry" : ""})`)
    .join("; ");

  const result = await generateText({
    model: getLanguageModel(),
    maxSteps: 8,
    system: [
      "You are TacoCart Concierge, embedded on a recipe article.",
      `The reader is on "${recipe.title.en}" (${recipe.title.ja}).`,
      `Base servings: ${recipe.baseServings}. Default spice: ${recipe.defaultSpice}.`,
      `Ingredients: ${ingredientList}.`,
      `Reply in ${locale === "ja" ? "Japanese" : "English"}.`,
      "When the reader wants different servings, a spice change, a cart, or to buy, call scale_recipe and then create_paypal_order.",
      "create_paypal_order uses the PayPal Agent Toolkit create_order tool. Prices come from the catalog on the server. Never invent prices, SKUs, or order ids.",
      "Do not capture payment. The PayPal JS SDK v6 button captures after the reader approves.",
      "Do not say a refund or a shipment update was submitted. Those tools are not available in this chat yet.",
      "Mention pantry items as things the cook already has, not as lines to buy.",
      "If a tool returns an error, explain it in plain language.",
      "Keep the reply under 130 words. The widget draws the cart, so summarize the result.",
    ].join("\n"),
    messages: session.messages.map((entry) => ({ role: entry.role, content: entry.content })),
    tools: {
      scale_recipe: tool({
        description:
          "Scale the recipe on this page to a serving count and spice level, then build the catalog cart (kits, ingredients, tools).",
        parameters: z.object({
          servings: z.number().int().min(1).max(24),
          spice: z.enum(["mild", "medium", "hot"]),
          omitTools: z.boolean().optional().describe("True when the reader already has a skillet or asked to skip tools."),
        }),
        execute: async ({ servings, spice, omitTools }) => {
          applyScaleAndCart(session, recipe, servings, spice, Boolean(omitTools));
          if (process.env.TACOCART_DEBUG === "1") console.info("[tacocart] scale_recipe", servings, spice);
          return {
            servings,
            spice,
            adjustments: session.scaled?.adjustments.map((item) => item.en),
            pantry: session.cart?.pantry.map((item) => item.en),
            cart: cartSummary(session),
          };
        },
      }),
      build_cart: tool({
        description: "Return the cart most recently built by scale_recipe.",
        parameters: z.object({
          note: z.string().optional(),
        }),
        execute: async () => {
          if (!session.cart) throw new Error("Scale the recipe before reading the cart.");
          return cartSummary(session);
        },
      }),
      create_paypal_order: tool({
        description:
          "Create a PayPal Sandbox order for the current cart via the PayPal Agent Toolkit. Do not pass prices. Do not capture.",
        parameters: z.object({
          confirm: z.boolean().describe("True when the reader is ready for a PayPal order."),
        }),
        execute: async () => {
          if (!session.cart && session.scaled) session.cart = buildCart(session.scaled, { omitTools: session.omitTools });
          const order = await ensureOrder(session, urls);
          if (process.env.TACOCART_DEBUG === "1") console.info("[tacocart] create_order", order.id, order.mock);
          return { orderId: order.id, status: order.status, mock: order.mock, total: session.cart?.total, currency: "USD" };
        },
      }),
      get_order: tool({
        description: "Read a PayPal order through the Agent Toolkit get_order tool.",
        parameters: z.object({ orderId: z.string() }),
        execute: async ({ orderId }) => getPayPalGateway().getOrder(orderId),
      }),
    },
  });

  return result.text.trim();
}

function cartSummary(session: Session) {
  return {
    lines: session.cart?.lines.map((line) => ({
      sku: line.sku,
      name: line.name.en,
      category: line.category,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    subtotal: session.cart?.subtotal,
    shipping: session.cart?.shipping,
    total: session.cart?.total,
    currency: "USD",
  };
}
