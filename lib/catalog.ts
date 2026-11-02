import catalogFile from "@/data/catalog.json";
import type { Catalog, Product } from "@/lib/types";

export const catalog = catalogFile as Catalog;

export function listProducts(): Product[] {
  return catalog.products;
}

export function getProduct(sku: string): Product | undefined {
  return catalog.products.find((product) => product.sku === sku);
}
