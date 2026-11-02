import { json, preflight } from "@/lib/http";
import { getLlmModel, getLlmProvider, hasLlmCredentials } from "@/lib/llm";
import { isPayPalMock, isPayPalSandbox } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export function GET() {
  const sandbox = isPayPalSandbox();
  const paypalMock = isPayPalMock();
  let llmProvider = "openai";
  let llmModel = "gpt-4o-mini";
  try {
    llmProvider = getLlmProvider();
    llmModel = getLlmModel();
  } catch {
    llmProvider = "openai";
  }
  return json({
    paypalMock,
    paypalEnvironment: sandbox ? "sandbox" : "live",
    paypalClientId: paypalMock ? null : process.env.PAYPAL_CLIENT_ID,
    sdkUrl: sandbox ? "https://www.sandbox.paypal.com/web-sdk/v6/core" : "https://www.paypal.com/web-sdk/v6/core",
    llmEnabled: hasLlmCredentials(),
    llmProvider,
    llmModel,
  });
}

export function OPTIONS() {
  return preflight();
}
