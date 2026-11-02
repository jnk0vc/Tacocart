import { formatUSD } from "@/lib/money";
import type { Cart, Locale, PublicOrder, Recipe, ScaledRecipe } from "@/lib/types";

const SPICE_LABEL: Record<Locale, Record<string, string>> = {
  en: { mild: "mild", medium: "medium", hot: "hot" },
  ja: { mild: "甘口", medium: "中辛", hot: "辛口" },
};

export function shopReply(input: {
  locale: Locale;
  recipe: Recipe;
  scaled: ScaledRecipe;
  cart: Cart;
  order?: PublicOrder;
  orderError?: string;
  mock: boolean;
}): string {
  const { locale, recipe, scaled, cart, order, orderError, mock } = input;
  const spice = SPICE_LABEL[locale][scaled.spice] ?? scaled.spice;
  const title = recipe.title[locale];
  const adjustments = cart.adjustments.map((item) => item[locale]).join(" ");
  const pantry = cart.pantry.map((item) => item[locale]);
  const total = formatUSD(cart.total, locale);
  const shipping =
    cart.shipping === 0
      ? locale === "ja"
        ? "送料は無料です。"
        : "Shipping is free."
      : locale === "ja"
        ? `送料は ${formatUSD(cart.shipping, locale)} です。`
        : `Shipping is ${formatUSD(cart.shipping, locale)}.`;

  if (locale === "ja") {
    const pay = order
      ? `PayPalサンドボックスの注文 ${order.id} を作成しました。下のボタンで支払いを確定してください。${mock ? "これはモック注文で、実売上ではありません。" : "サンドボックスの個人アカウントでログインしてください。実カードへの請求はありません。"}`
      : orderError
        ? `カートはできましたが、PayPalの注文作成に失敗しました。${orderError}`
        : "下のボタンからPayPalの注文に進めます。";
    const pantryLine = pantry.length ? ` 家にある想定: ${pantry.join("、")}。` : "";
    return `${title}を${scaled.baseServings}人分から${scaled.servings}人分、${spice}に調整しました。${adjustments}${pantryLine} 合計は ${total}。${shipping} ${pay}`;
  }

  const pay = order
    ? `PayPal order ${order.id} is ready. Use the button below to approve it.${mock ? " This is a mock order, not a live capture." : " Sign in with your Sandbox personal account — this does not charge a live card."}`
    : orderError
      ? `The cart is ready, but PayPal order creation failed. ${orderError}`
      : "Use the button below to open PayPal.";
  const pantryLine = pantry.length ? ` Left in the pantry: ${pantry.join(", ")}.` : "";
  return `Scaled ${title} from ${scaled.baseServings} to ${scaled.servings} servings at ${spice} heat. ${adjustments}${pantryLine} Total ${total}. ${shipping} ${pay}`;
}

export function guideReply(locale: Locale): string {
  if (locale === "ja") {
    return "人数と辛さを教えてください。たとえば「4人分、辛さ控えめ」。レシピを合わせてカートを作り、PayPalサンドボックスの注文を用意します。";
  }
  return "Tell me how many people and how spicy you want it. For example: “Make this for 4 people, mild spice.” I’ll scale the recipe, build a cart, and open a PayPal Sandbox order.";
}

export function alreadyPaidReply(locale: Locale, orderId: string): string {
  if (locale === "ja") {
    return `注文 ${orderId} は支払い済みです。到着は「いつ届きますか？」、返品は「1つ返品したい」と聞いてください。どちらも次の段階の下書きで、まだPayPalには送りません。`;
  }
  return `Order ${orderId} is already paid. Ask “When will it arrive?” or “I want to return one item.” Both are drafted for the next milestone and are not sent to PayPal yet.`;
}

export function paidReply(locale: Locale, orderId: string, captureId: string): string {
  if (locale === "ja") {
    return `支払いを確定しました。注文 ${orderId}、売上 ${captureId}。到着や返品の質問も、このチャットで受けます。`;
  }
  return `Payment captured. Order ${orderId}, capture ${captureId}. You can ask when it will arrive, or start a return, in this same chat.`;
}

export function cancelledReply(locale: Locale): string {
  if (locale === "ja") return "PayPalでの承認はキャンセルされました。準備ができたら、もう一度ボタンを押してください。";
  return "PayPal approval was cancelled. Press the button again when you want to continue.";
}
