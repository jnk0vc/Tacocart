import { randomUUID } from "node:crypto";
import type { Locale, Session } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Store = Map<string, Session>;

const globalStore = globalThis as typeof globalThis & { __tacocartSessions?: Store };

function store(): Store {
  if (!globalStore.__tacocartSessions) globalStore.__tacocartSessions = new Map();
  return globalStore.__tacocartSessions;
}

export function resetSessionStore(): void {
  store().clear();
}

export function getSession(id: string): Session | undefined {
  return store().get(id);
}

export function getOrCreateSession(id: string | undefined, recipeId: string, locale: Locale): Session {
  if (id && UUID.test(id)) {
    const existing = store().get(id);
    if (existing) {
      if (existing.recipeId !== recipeId) {
        throw new Error("This chat is already tied to a different recipe. Reload the page to start another.");
      }
      return existing;
    }
  }
  const session: Session = {
    id: randomUUID(),
    recipeId,
    locale,
    messages: [],
    createdAt: Date.now(),
  };
  store().set(session.id, session);
  return session;
}
