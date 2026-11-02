export type Locale = "en" | "ja";
export type Spice = "mild" | "medium" | "hot";
export type Unit = "g" | "ml" | "piece" | "tbsp" | "tsp";
export type ProductCategory = "ingredient" | "kit" | "tool";

export type Localized = { en: string; ja: string };

export type Ingredient = {
  id: string;
  name: Localized;
  quantity: number;
  unit: Unit;
  pantry?: boolean;
};

export type Recipe = {
  id: string;
  number: string;
  title: Localized;
  dek: Localized;
  baseServings: number;
  prepMinutes: number;
  cookMinutes: number;
  defaultSpice: Spice;
  ingredients: Ingredient[];
  steps: Localized[];
  note: Localized;
};

export type ProductCover = {
  ingredientId: string;
  amount: number;
};

export type Product = {
  sku: string;
  name: Localized;
  description: Localized;
  category: ProductCategory;
  price: number;
  serves?: number;
  recipeIds?: string[];
  covers: ProductCover[];
};

export type Catalog = {
  currency: "USD";
  shipping: { flat: number; freeOver: number };
  products: Product[];
};

export type ScaledIngredient = Ingredient & { scaledFrom: number };

export type ScaledRecipe = {
  recipeId: string;
  servings: number;
  baseServings: number;
  spice: Spice;
  factor: number;
  ingredients: ScaledIngredient[];
  adjustments: Localized[];
};

export type CartLine = {
  sku: string;
  name: Localized;
  description: Localized;
  category: ProductCategory;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type Cart = {
  recipeId: string;
  servings: number;
  spice: Spice;
  currency: "USD";
  lines: CartLine[];
  adjustments: Localized[];
  pantry: Localized[];
  subtotal: number;
  shipping: number;
  total: number;
  fingerprint: string;
};

export type PublicOrder = {
  id: string;
  status: string;
  mock: boolean;
};

export type PublicCapture = {
  id: string;
  orderId: string;
  status: string;
  mock: boolean;
  amount?: { currencyCode: string; value: string };
};

export type PendingTool = {
  tool: "get_shipment_tracking" | "create_refund";
  status: "stub";
  args: Record<string, unknown>;
  note: string;
};

export type ChatRole = "user" | "assistant";

export type Session = {
  id: string;
  recipeId: string;
  locale: Locale;
  messages: { role: ChatRole; content: string }[];
  scaled?: ScaledRecipe;
  omitTools?: boolean;
  cart?: Cart;
  order?: PublicOrder & { fingerprint: string };
  capture?: PublicCapture;
  createdAt: number;
};
