import type { Session, Spice } from "@/lib/types";

export type Intent =
  | { type: "tracking" }
  | { type: "refund"; itemHint?: string }
  | { type: "shop"; servings?: number; spice?: Spice; omitTools: boolean; checkout: boolean }
  | { type: "chat" };

const REFUND = /(refund|return|send (it|one|them) back|返品|返金|返した)/i;
const TRACKING = /(when will it arrive|where is (my|the) (order|package)|track(ing)?|shipment|delivery|届|配送|追跡|いつ届)/i;
const CHECKOUT = /(check\s?out|pay\b|buy\b|purchase|購入|支払|チェックアウト|買って|買う)/i;
const YES = /^(yes|yeah|yep|ok|okay|sure|please|はい|お願い|うん)[.!]?$/i;
const OMIT_TOOLS = /(already have (a |the )?(skillet|pan|tool)|no tools|skip the (skillet|pan|tool)|フライパンは(持|ある)|道具は(いらない|不要|持って))/i;
const SHOP_WORD = /(make this|scale|servings|people|guests|spice|mild|medium|hot|cart|kit|cook this|人分|辛さ|甘口|辛口|辛め|作って|カート)/i;

export function detectIntent(message: string, session: Session): Intent {
  const text = message.trim();
  if (REFUND.test(text)) {
    const hint = text.replace(REFUND, "").replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "");
    return { type: "refund", itemHint: hint || undefined };
  }
  if (TRACKING.test(text)) return { type: "tracking" };

  const servings = readServings(text);
  const spice = readSpice(text);
  const omitTools = OMIT_TOOLS.test(text);
  const checkout = CHECKOUT.test(text) || (Boolean(session.cart) && YES.test(text));
  if (servings || spice || checkout || SHOP_WORD.test(text) || (omitTools && session.cart)) {
    return { type: "shop", servings, spice, omitTools, checkout };
  }
  return { type: "chat" };
}

function readServings(text: string): number | undefined {
  const patterns = [
    /(\d+)\s*(people|persons|servings|guests|人)/i,
    /(?:for|serves|make it for)\s+(\d+)/i,
    /(\d+)\s*人分/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value >= 1 && value <= 24) return value;
  }
  return undefined;
}

function readSpice(text: string): Spice | undefined {
  if (/(not spicy|no heat|mild|gentle|甘口|辛さ控え|辛くない|控えめ)/i.test(text)) return "mild";
  if (/(extra hot|very hot|hot\b|spicy|辛口|辛め|激辛)/i.test(text)) return "hot";
  if (/(medium|中辛)/i.test(text)) return "medium";
  return undefined;
}
