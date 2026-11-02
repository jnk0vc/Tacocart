import { toPayPalCreateOrderArgs, type PayPalCreateOrderArgs } from "@/lib/paypal-order";
import { getPayPalGateway, isPayPalMock } from "@/lib/paypal";
import type { PublicCapture, PublicOrder, Session } from "@/lib/types";

export async function ensureOrder(
  session: Session,
  urls: { returnUrl: string; cancelUrl: string },
): Promise<PublicOrder> {
  if (!session.cart) throw new Error("Build a cart before creating a PayPal order.");
  if (session.capture) throw new Error("This chat already has a captured payment.");
  if (session.order?.status === "CREATED" && session.order.fingerprint === session.cart.fingerprint) {
    return { id: session.order.id, status: session.order.status, mock: session.order.mock };
  }
  const args: PayPalCreateOrderArgs = toPayPalCreateOrderArgs(session.cart, urls);
  const created = await getPayPalGateway().createOrder(args);
  session.order = { ...created, fingerprint: session.cart.fingerprint };
  return { id: created.id, status: created.status, mock: created.mock };
}

export async function captureSessionOrder(session: Session, orderId: string): Promise<PublicCapture> {
  if (!session.order || session.order.id !== orderId) {
    throw new Error("That PayPal order is not the one open in this chat.");
  }
  if (session.capture?.orderId === orderId) return session.capture;
  const captured = await getPayPalGateway().captureOrder(orderId);
  session.order.status = "COMPLETED";
  session.capture = captured;
  return captured;
}

export function paypalIsMock(): boolean {
  return isPayPalMock();
}
