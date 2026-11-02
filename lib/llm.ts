import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";

export type LlmProvider = "openai" | "anthropic" | "google";

export function getLlmProvider(): LlmProvider {
  const value = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  if (value === "openai" || value === "anthropic" || value === "google") return value;
  throw new Error(`Unsupported LLM_PROVIDER "${value}". Use openai, anthropic, or google.`);
}

export function getLlmModel(provider = getLlmProvider()): string {
  if (process.env.LLM_MODEL) return process.env.LLM_MODEL;
  if (provider === "anthropic") return "claude-3-5-haiku-latest";
  if (provider === "google") return "gemini-2.0-flash";
  return "gpt-4o-mini";
}

export function hasLlmCredentials(provider = safeProvider()): boolean {
  if ((process.env.LLM_MODE || "auto").toLowerCase() === "fallback") return false;
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === "google") return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  return Boolean(process.env.OPENAI_API_KEY);
}

function safeProvider(): LlmProvider {
  try {
    return getLlmProvider();
  } catch {
    return "openai";
  }
}

export function getLanguageModel(): LanguageModelV1 {
  const provider = getLlmProvider();
  const model = getLlmModel(provider);
  if (provider === "anthropic") return anthropic(model);
  if (provider === "google") return google(model);
  return openai(model);
}
