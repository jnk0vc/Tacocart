import { notFound } from "next/navigation";
import { RecipeArticle } from "@/components/RecipeArticle";
import { getRecipe } from "@/lib/recipes";

export default function HomePage() {
  const recipe = getRecipe("miso-chicken-tacos");
  if (!recipe) notFound();
  return <RecipeArticle recipe={recipe} />;
}
