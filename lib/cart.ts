import { catalog } from "@/lib/catalog";
import { roundMoney } from "@/lib/money";
import type { Cart, CartLine, Localized, Product, ScaledIngredient, ScaledRecipe } from "@/lib/types";

const KIT_COVERAGE = 0.6;

function packsFor(needed: number, packAmount: number): number {
  if (packAmount <= 0) return 1;
  return Math.max(1, Math.ceil(needed / packAmount - 1e-9));
}

function cheapestCover(ingredient: ScaledIngredient, products: Product[]): { product: Product; quantity: number } | undefined {
  const candidates = products.filter(
    (product) =>
      product.category === "ingredient" &&
      product.covers.some((cover) => cover.ingredientId === ingredient.id),
  );
  let best: { product: Product; quantity: number; cost: number } | undefined;
  for (const product of candidates) {
    const cover = product.covers.find((item) => item.ingredientId === ingredient.id);
    if (!cover) continue;
    const quantity = packsFor(ingredient.quantity, cover.amount);
    const cost = roundMoney(quantity * product.price);
    if (!best || cost < best.cost || (cost === best.cost && quantity < best.quantity)) {
      best = { product, quantity, cost };
    }
  }
  return best ? { product: best.product, quantity: best.quantity } : undefined;
}

function lineFrom(product: Product, quantity: number): CartLine {
  const unitPrice = roundMoney(product.price);
  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
    category: product.category,
    quantity,
    unitPrice,
    lineTotal: roundMoney(unitPrice * quantity),
  };
}

function kitCoversAmount(kit: Product, ingredientId: string, kitQuantity: number): number {
  const cover = kit.covers.find((item) => item.ingredientId === ingredientId);
  return cover ? cover.amount * kitQuantity : 0;
}

export function buildCart(scaled: ScaledRecipe, options: { omitTools?: boolean } = {}): Cart {
  const shoppable = scaled.ingredients.filter((ingredient) => !ingredient.pantry);
  const pantry: Localized[] = scaled.ingredients.filter((ingredient) => ingredient.pantry).map((ingredient) => ingredient.name);
  const ingredientIds = shoppable.map((ingredient) => ingredient.id);

  const kits = catalog.products.filter(
    (product) => product.category === "kit" && product.recipeIds?.includes(scaled.recipeId) && product.serves,
  );

  let chosenKit: { product: Product; quantity: number } | undefined;
  for (const kit of kits) {
    const coveredCount = ingredientIds.filter((id) => kit.covers.some((cover) => cover.ingredientId === id)).length;
    const coverage = ingredientIds.length === 0 ? 0 : coveredCount / ingredientIds.length;
    if (coverage < KIT_COVERAGE) continue;
    const quantity = Math.ceil(scaled.servings / (kit.serves ?? scaled.servings));
    if (!chosenKit || coveredCount > kitCoversScore(chosenKit.product, ingredientIds)) {
      chosenKit = { product: kit, quantity };
    }
  }

  const lines: CartLine[] = [];
  if (chosenKit) lines.push(lineFrom(chosenKit.product, chosenKit.quantity));

  for (const ingredient of shoppable) {
    const covered = chosenKit ? kitCoversAmount(chosenKit.product, ingredient.id, chosenKit.quantity) : 0;
    if (covered + 1e-9 >= ingredient.quantity) continue;
    const remaining = { ...ingredient, quantity: ingredient.quantity - covered };
    const match = cheapestCover(remaining, catalog.products);
    if (!match) {
      throw new Error(`No catalog product covers ingredient "${ingredient.id}".`);
    }
    const existing = lines.find((line) => line.sku === match.product.sku);
    if (existing) {
      existing.quantity += match.quantity;
      existing.lineTotal = roundMoney(existing.unitPrice * existing.quantity);
    } else {
      lines.push(lineFrom(match.product, match.quantity));
    }
  }

  if (!options.omitTools) {
    for (const tool of catalog.products) {
      if (tool.category !== "tool") continue;
      if (tool.recipeIds && !tool.recipeIds.includes(scaled.recipeId)) continue;
      lines.push(lineFrom(tool, 1));
    }
  }

  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const shipping = subtotal >= catalog.shipping.freeOver || subtotal === 0 ? 0 : catalog.shipping.flat;
  const total = roundMoney(subtotal + shipping);
  const fingerprint = `${scaled.recipeId}:${scaled.servings}:${scaled.spice}:${options.omitTools ? "no-tools" : "tools"}:${lines
    .map((line) => `${line.sku}x${line.quantity}`)
    .join(",")}`;

  return {
    recipeId: scaled.recipeId,
    servings: scaled.servings,
    spice: scaled.spice,
    currency: "USD",
    lines,
    adjustments: scaled.adjustments,
    pantry,
    subtotal,
    shipping: roundMoney(shipping),
    total,
    fingerprint,
  };
}

function kitCoversScore(kit: Product, ingredientIds: string[]): number {
  return ingredientIds.filter((id) => kit.covers.some((cover) => cover.ingredientId === id)).length;
}
