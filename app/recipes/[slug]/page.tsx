import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecipeArticle } from "@/components/RecipeArticle";
import { getRecipe, listRecipes } from "@/lib/recipes";

export function generateStaticParams() {
  return listRecipes().map((recipe) => ({ slug: recipe.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const recipe = getRecipe(slug);
  if (!recipe) return { title: "Recipe" };
  return {
    title: `${recipe.title.en} — Uchi Taco`,
    description: recipe.dek.en,
  };
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = getRecipe(slug);
  if (!recipe) notFound();
  return <RecipeArticle recipe={recipe} />;
}
