import Link from "next/link";
import { Plate } from "@/components/Plate";
import { TacoMark } from "@/components/TacoMark";
import { WidgetEmbed } from "@/components/WidgetEmbed";
import { listRecipes } from "@/lib/recipes";
import type { Recipe, Unit } from "@/lib/types";

const UNIT: Record<Unit, string> = {
  g: "g",
  ml: "ml",
  piece: "pc",
  tbsp: "tbsp",
  tsp: "tsp",
};

function amount(quantity: number, unit: Unit): string {
  const value = Number.isInteger(quantity) ? String(quantity) : String(quantity);
  return `${value} ${UNIT[unit]}`;
}

export function RecipeArticle({ recipe }: { recipe: Recipe }) {
  const recipes = listRecipes();
  const minutes = recipe.prepMinutes + recipe.cookMinutes;
  return (
    <>
      <header className="mast">
        <Link className="brand" href="/">
          <TacoMark className="seal" />
          <span>
            <strong>Uchi Taco</strong>
            <span>A journal of Japanese tacos</span>
          </span>
        </Link>
        <p>Demo host for TacoCart</p>
      </header>
      <nav className="switcher" aria-label="Recipes">
        {recipes.map((item) => {
          const href = item.id === "miso-chicken-tacos" ? "/" : `/recipes/${item.id}`;
          const current = item.id === recipe.id;
          return (
            <a key={item.id} href={href} aria-current={current ? "page" : undefined}>
              {item.title.en}
            </a>
          );
        })}
      </nav>
      <article className="sheet">
        <p className="eyebrow">Recipe {recipe.number} · Weeknight</p>
        <h1>{recipe.title.en}</h1>
        <p className="dek">{recipe.dek.en}</p>
        <ul className="meta">
          <li>
            <strong>{minutes} min</strong> prep and cook
          </li>
          <li>
            Serves <strong>{recipe.baseServings}</strong>
          </li>
          <li>
            Heat <strong>{recipe.defaultSpice}</strong>
          </li>
        </ul>
        <div className="hero-row">
          <Plate />
          <p className="try">
            The concierge on this page is the same drop-in widget a travel diary or a blog would embed. Try “Make this
            for 4 people, mild spice”, then pay with a PayPal Sandbox buyer.
          </p>
        </div>
        <h2>Ingredients</h2>
        <ul className="ingredients">
          {recipe.ingredients.map((ingredient) => (
            <li key={ingredient.id}>
              <span className="qty">{amount(ingredient.quantity, ingredient.unit)}</span>
              <span>
                {ingredient.name.en}
                {ingredient.pantry ? " · pantry" : ""}
              </span>
            </li>
          ))}
        </ul>
        <h2>Method</h2>
        <ol className="steps">
          {recipe.steps.map((step) => (
            <li key={step.en}>{step.en}</li>
          ))}
        </ol>
        <p className="note">{recipe.note.en}</p>
      </article>
      <footer className="foot">
        <span>Original demo recipes for the PayPal AI Hackathon. Not the uchitaco.com archive.</span>
        <a href="https://paypalaihackathon.devpost.com/">PayPal AI Hackathon</a>
      </footer>
      <WidgetEmbed recipeId={recipe.id} />
    </>
  );
}
