import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { handleChat } from "@/lib/agent";
import { buildCart } from "@/lib/cart";
import { captureSessionOrder } from "@/lib/checkout";
import { detectIntent } from "@/lib/intent";
import { toPayPalCreateOrderArgs } from "@/lib/paypal-order";
import { isPayPalMock, paypalToolkitContext, resetPayPalGateway } from "@/lib/paypal";
import { getRecipe, listRecipes } from "@/lib/recipes";
import { scaleRecipe } from "@/lib/scale";
import { getSession, resetSessionStore } from "@/lib/session";
import type { Session } from "@/lib/types";

const urls = { returnUrl: "http://localhost:3000/", cancelUrl: "http://localhost:3000/" };

beforeEach(() => {
  process.env.PAYPAL_MODE = "mock";
  process.env.PAYPAL_ENVIRONMENT = "sandbox";
  process.env.LLM_MODE = "fallback";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  resetSessionStore();
  resetPayPalGateway();
});

describe("recipe scaling and cart", () => {
  it("scales miso chicken to 4 mild and prices the cart from the catalog", () => {
    const recipe = getRecipe("miso-chicken-tacos");
    if (!recipe) throw new Error("missing recipe");
    const scaled = scaleRecipe(recipe, 4, "mild");
    expect(scaled.ingredients.some((item) => item.id === "fresh-chili")).toBe(false);
    expect(scaled.ingredients.find((item) => item.id === "yuzu-kosho")?.quantity).toBe(1);
    expect(scaled.ingredients.find((item) => item.id === "chicken-thigh")?.quantity).toBe(600);

    const cart = buildCart(scaled);
    expect(cart.lines.map((line) => [line.sku, line.quantity])).toEqual([
      ["kit-miso-chicken", 2],
      ["mirin-bottle", 1],
      ["yuzu-kosho-jar", 1],
      ["skillet-carbon", 1],
    ]);
    expect(cart.pantry.map((item) => item.en)).toEqual(["Sugar"]);
    expect(cart.subtotal).toBe(89.5);
    expect(cart.shipping).toBe(0);
    expect(cart.total).toBe(89.5);

    const order = toPayPalCreateOrderArgs(cart, urls);
    expect(order.currencyCode).toBe("USD");
    expect(order.shippingCost).toBe(0);
    expect(order.items.map((item) => item.itemCost)).toEqual([24, 5.5, 8, 28]);
    expect(order.items.every((item) => item.itemTotal === item.itemCost * item.quantity)).toBe(true);
  });

  it("keeps a 2-serving medium batch under the free-shipping line and can skip the skillet", () => {
    const recipe = getRecipe("miso-chicken-tacos");
    if (!recipe) throw new Error("missing recipe");
    const cart = buildCart(scaleRecipe(recipe, 2, "medium"));
    expect(cart.lines.map((line) => line.sku)).toEqual(["kit-miso-chicken", "mirin-bottle", "chili-pack", "skillet-carbon"]);
    expect(cart.subtotal).toBe(59.75);
    expect(cart.shipping).toBe(6.5);
    expect(cart.total).toBe(66.25);

    const noTools = buildCart(scaleRecipe(recipe, 2, "medium"), { omitTools: true });
    expect(noTools.lines.some((line) => line.category === "tool")).toBe(false);
  });

  it("builds a cart for every sample recipe", () => {
    for (const recipe of listRecipes()) {
      const cart = buildCart(scaleRecipe(recipe, recipe.baseServings, recipe.defaultSpice));
      expect(cart.lines.length).toBeGreaterThan(0);
      expect(cart.total).toBeGreaterThan(0);
    }
  });
});

describe("intent", () => {
  const session = { cart: undefined } as Session;

  it("reads the demo prompts", () => {
    expect(detectIntent("Make this for 4 people, mild spice", session)).toMatchObject({
      type: "shop",
      servings: 4,
      spice: "mild",
    });
    expect(detectIntent("4人分、辛さ控えめ", session)).toMatchObject({ type: "shop", servings: 4, spice: "mild" });
    expect(detectIntent("Keep it for 2, but make it hot", session)).toMatchObject({ type: "shop", servings: 2, spice: "hot" });
    expect(detectIntent("When will it arrive?", session).type).toBe("tracking");
    expect(detectIntent("いつ届きますか？", session).type).toBe("tracking");
    expect(detectIntent("I want to return one item", session).type).toBe("refund");
    expect(detectIntent("1つ返品したい", session).type).toBe("refund");
  });
});

describe("chat with mock PayPal", () => {
  it("creates a sandbox-shaped mock order without an LLM key", async () => {
    expect(isPayPalMock()).toBe(true);
    expect(paypalToolkitContext().sandbox).toBe(true);

    const result = await handleChat({
      recipeId: "miso-chicken-tacos",
      message: "Make this for 4 people, mild spice",
      locale: "en",
      ...urls,
    });

    expect(result.mode).toBe("fallback");
    expect(result.flow).toBe("shop");
    expect(result.order?.mock).toBe(true);
    expect(result.order?.id).toMatch(/^[A-Z0-9]{17,32}$/);
    expect(result.cart?.total).toBe(89.5);
    expect(result.reply).toContain(result.order?.id ?? "missing");

    const session = getSession(result.sessionId);
    if (!session) throw new Error("missing session");
    const capture = await captureSessionOrder(session, result.order!.id);
    expect(capture.id).toMatch(/^[A-Z0-9]{17}$/);
    expect(capture.mock).toBe(true);

    const tracking = await handleChat({
      sessionId: result.sessionId,
      recipeId: "miso-chicken-tacos",
      message: "When will it arrive?",
      locale: "en",
      ...urls,
    });
    expect(tracking.flow).toBe("tracking_stub");
    expect(tracking.pendingAction).toMatchObject({
      tool: "get_shipment_tracking",
      status: "stub",
      args: { order_id: result.order?.id, transaction_id: capture.id },
    });
    expect(tracking.reply).toContain("Nothing was sent");

    const refund = await handleChat({
      sessionId: result.sessionId,
      recipeId: "miso-chicken-tacos",
      message: "I want to return the skillet",
      locale: "en",
      ...urls,
    });
    expect(refund.flow).toBe("refund_stub");
    expect(refund.pendingAction?.tool).toBe("create_refund");
    expect(refund.pendingAction?.args).toMatchObject({
      capture_id: capture.id,
      amount: { currency_code: "USD", value: "28.00" },
      sku: "skillet-carbon",
    });
    expect(refund.reply).toContain("was not called");
  });

  it("replies in Japanese for a Japanese shop request", async () => {
    const result = await handleChat({
      recipeId: "yuzu-shrimp-tacos",
      message: "4人分、辛さ控えめ",
      locale: "ja",
      ...urls,
    });
    expect(result.locale).toBe("ja");
    expect(result.cart?.servings).toBe(4);
    expect(result.cart?.spice).toBe("mild");
    expect(result.reply).toContain("PayPal");
    expect(result.order?.mock).toBe(true);
  });
});

describe("embed script", () => {
  it("ships the PayPal JS SDK v6 sandbox button flow", () => {
    const source = readFileSync(path.join(process.cwd(), "public/widget.js"), "utf8");
    expect(source).toContain("https://www.sandbox.paypal.com/web-sdk/v6/core");
    expect(source).toContain("createPayPalOneTimePaymentSession");
    expect(source).toContain('presentationMode: "auto"');
    expect(source).toContain("orderId");
    expect(source).toContain('customElements.define("tacocart-concierge"');
  });
});
