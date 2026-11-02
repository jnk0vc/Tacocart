import type { Locale, PendingTool, Session } from "@/lib/types";

/**
 * Post-purchase flows are recognized in the chat, but the PayPal calls are
 * intentionally not executed yet.
 *
 * TODO(shipment): after a capture, a merchant event should call
 *   toolkit.getTools().create_shipment_tracking.execute({
 *     tracking_number, transaction_id: session.capture.id, carrier, status: "SHIPPED",
 *     order_id: session.order.id,
 *   })
 * and the reader question below should call
 *   toolkit.getTools().get_shipment_tracking.execute({
 *     order_id: session.order.id,
 *     transaction_id: session.capture.id,
 *   })
 *
 * TODO(refund): a confirmed line item should call
 *   toolkit.getTools().create_refund.execute({
 *     capture_id: session.capture.id,
 *     amount: { currency_code: "USD", value: lineTotal },
 *     note_to_payer,
 *   })
 * Partial refunds need the capture id from pay_order, not the order id.
 */

export function planShipmentLookup(session: Session): PendingTool {
  return {
    tool: "get_shipment_tracking",
    status: "stub",
    args: {
      order_id: session.order?.id ?? null,
      transaction_id: session.capture?.id ?? null,
    },
    note: "Shipment tracking is stubbed. get_shipment_tracking is not called.",
  };
}

export function planRefund(session: Session, itemHint?: string): PendingTool {
  const line = itemHint ? matchLine(session, itemHint) : undefined;
  const label = line?.name.en ?? itemHint;
  return {
    tool: "create_refund",
    status: "stub",
    args: {
      capture_id: session.capture?.id ?? null,
      note_to_payer: label ? `Return requested: ${label}` : "Return requested from TacoCart chat",
      ...(line ? { amount: { currency_code: "USD", value: line.lineTotal.toFixed(2) }, sku: line.sku } : {}),
    },
    note: "Refunds are stubbed. create_refund is not called.",
  };
}

function matchLine(session: Session, hint: string) {
  const needle = hint.toLowerCase();
  return session.cart?.lines.find((line) => {
    const names = `${line.name.en} ${line.name.ja} ${line.sku}`.toLowerCase();
    return needle.split(/\s+/).some((word) => word.length > 2 && names.includes(word));
  });
}

export function trackingReply(session: Session, locale: Locale): string {
  const order = session.order?.id;
  const capture = session.capture?.id;
  if (locale === "ja") {
    if (!order) {
      return "まだ注文がないので、配送の照会はできません。先にレシピの人数を決めて、PayPalで支払ってください。追跡は次の段階で PayPal の get_shipment_tracking を呼びます。いまは送信していません。";
    }
    return `注文 ${order} の到着予定は、まだキャリアの追跡番号がありません。${
      capture ? `売上 ${capture} を受け取ったあと、` : ""
    }次の段階で get_shipment_tracking を呼びます。このメッセージでは PayPal に問い合わせていません。`;
  }
  if (!order) {
    return "There isn’t an order to track yet. Scale the recipe and pay with PayPal first. The next milestone calls PayPal get_shipment_tracking — this reply does not.";
  }
  return `I don’t have a carrier scan for order ${order} yet.${
    capture ? ` Capture ${capture} is the transaction a tracker would attach to.` : " Payment has not been captured, so there is no transaction id."
  } Next step calls get_shipment_tracking. Nothing was sent to PayPal just now.`;
}

export function refundReply(session: Session, locale: Locale, itemHint?: string): string {
  const pending = planRefund(session, itemHint);
  const line = itemHint ? matchLine(session, itemHint) : undefined;
  const named = line ? ` (${line.name[locale]})` : itemHint ? ` (${itemHint})` : "";
  const amount = pending.args.amount as { value?: string } | undefined;
  if (locale === "ja") {
    if (!session.capture) {
      return `返品${named}は、支払い確定後に create_refund で扱います。まだ売上IDがないので、返金は送っていません。`;
    }
    return `${amount?.value ? `${amount.value} USD の一部返金` : "返金"}の下書きはできていますが、create_refund はまだ呼びません。売上 ${session.capture.id} はそのままです。`;
  }
  if (!session.capture) {
    return `I can prepare a return${named} after the payment is captured. There is no capture id yet, so create_refund was not called.`;
  }
  return amount?.value
    ? `I drafted a ${amount.value} USD return${named} against capture ${session.capture.id}. create_refund was not called, and the payment is unchanged.`
    : `I noted the return request${named} for capture ${session.capture.id}. create_refund was not called, and the payment is unchanged.`;
}
