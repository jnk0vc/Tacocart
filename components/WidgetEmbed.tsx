import Script from "next/script";

export function WidgetEmbed({ recipeId }: { recipeId: string }) {
  return (
    <>
      <tacocart-concierge recipe={recipeId} />
      <Script src="/widget.js" strategy="afterInteractive" data-recipe={recipeId} />
    </>
  );
}
