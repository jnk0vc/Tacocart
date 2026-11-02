import recipeFile from "@/data/recipes.json";
import type { Recipe } from "@/lib/types";

const recipes = recipeFile.recipes as Recipe[];

export function listRecipes(): Recipe[] {
  return recipes;
}

export function getRecipe(id: string): Recipe | undefined {
  return recipes.find((recipe) => recipe.id === id);
}
