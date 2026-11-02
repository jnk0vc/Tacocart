import type { Cart } from "@/lib/types";

export type PayPalOrderItem = {
  name: string;
  quantity: number;
  description?: string;
  itemCost: number;
  taxPercent: number;
  itemTotal: number;
};

/**
 * Body for the Agent Toolkit `create_order` tool.
 * Prices come from the server cart. The model never supplies them.
 * Currency is USD because toolkit 1.11.0 only accepts that enum.
 */
export type PayPalCreateOrderArgs = {
  currencyCode: "USD";
  items: PayPalOrderItem[];
  discount: number;
  shippingCost: number;
  shippingAddress: null;
  notes: string;
  returnUrl: string;
  cancelUrl: string;
};

export function toPayPalCreateOrderArgs(
  cart: Cart,
  urls: { returnUrl: string; cancelUrl: string },
): PayPalCreateOrderArgs {
  if (cart.lines.length === 0) {
    throw new Error("Cannot create a PayPal order for an empty cart.");
  }
  return {
    currencyCode: "USD",
    items: cart.lines.map((line) => ({
      name: line.name.en.slice(0, 127),
      quantity: line.quantity,
      description: `${line.category} · ${line.sku}`.slice(0, 127),
      itemCost: line.unitPrice,
      taxPercent: 0,
      itemTotal: line.lineTotal,
    })),
    discount: 0,
    shippingCost: cart.shipping,
    shippingAddress: null,
    notes: `TacoCart ${cart.recipeId} · ${cart.servings} servings · ${cart.spice}`.slice(0, 200),
    returnUrl: urls.returnUrl,
    cancelUrl: urls.cancelUrl,
  };
}

export function resolveReturnUrls(origin: string | null | undefined): { returnUrl: string; cancelUrl: string } {
  const fallback = origin && /^https?:\/\//.test(origin) ? origin : "http://localhost:3000";
  return {
    returnUrl: process.env.PAYPAL_RETURN_URL || fallback,
    cancelUrl: process.env.PAYPAL_CANCEL_URL || fallback,
  };
}
