import { json, preflight } from "@/lib/http";

export function GET() {
  return json({ ok: true, service: "tacocart-concierge" });
}

export function OPTIONS() {
  return preflight();
}
