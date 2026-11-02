import type { Ingredient, Localized, Recipe, ScaledIngredient, ScaledRecipe, Spice, Unit } from "@/lib/types";

const SPICE_ADD: Record<Exclude<Spice, "medium">, Ingredient> = {
  mild: {
    id: "yuzu-kosho",
    name: { en: "Yuzu kosho", ja: "柚子胡椒" },
    quantity: 0.5,
    unit: "tsp",
  },
  hot: {
    id: "chili-oil",
    name: { en: "Chili oil", ja: "ラー油" },
    quantity: 1,
    unit: "tbsp",
  },
};

export function scaleQuantity(quantity: number, factor: number, unit: Unit): number {
  const raw = quantity * factor;
  if (unit === "g" || unit === "ml" || unit === "piece") {
    return Math.max(1, Math.round(raw));
  }
  return Math.max(0.25, Math.round(raw * 4) / 4);
}

export function scaleRecipe(recipe: Recipe, servings: number, spice: Spice): ScaledRecipe {
  if (!Number.isInteger(servings) || servings < 1 || servings > 24) {
    throw new Error("Servings must be a whole number from 1 to 24.");
  }

  const factor = servings / recipe.baseServings;
  const adjustments: Localized[] = [];
  const ingredients: ScaledIngredient[] = recipe.ingredients
    .filter((ingredient) => !(spice === "mild" && ingredient.id === "fresh-chili"))
    .map((ingredient) => {
      const multiplier = spice === "hot" && ingredient.id === "fresh-chili" ? 2 : 1;
      return {
        ...ingredient,
        quantity: scaleQuantity(ingredient.quantity * multiplier, factor, ingredient.unit),
        scaledFrom: ingredient.quantity,
      };
    });

  if (spice === "mild" && recipe.ingredients.some((ingredient) => ingredient.id === "fresh-chili")) {
    adjustments.push({
      en: "Left the fresh chili out of a mild batch.",
      ja: "甘口なので生の唐辛子は外しました。",
    });
  }
  if (spice === "hot" && recipe.ingredients.some((ingredient) => ingredient.id === "fresh-chili")) {
    adjustments.push({
      en: "Doubled the fresh chili for a hotter batch.",
      ja: "辛口なので生の唐辛子を倍にしました。",
    });
  }
  if (spice === "mild" || spice === "hot") {
    const extra = SPICE_ADD[spice];
    ingredients.push({
      ...extra,
      quantity: scaleQuantity(extra.quantity, factor, extra.unit),
      scaledFrom: extra.quantity,
    });
    adjustments.push(
      spice === "mild"
        ? { en: "Added yuzu kosho for a softer kind of heat.", ja: "やわらかい辛さとして柚子胡椒を足しました。" }
        : { en: "Added chili oil for extra heat.", ja: "辛さの足しにラー油を足しました。" },
    );
  }

  return {
    recipeId: recipe.id,
    servings,
    baseServings: recipe.baseServings,
    spice,
    factor,
    ingredients,
    adjustments,
  };
}
