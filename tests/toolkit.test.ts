import { describe, expect, it } from "vitest";

/**
 * Confirms the installed Agent Toolkit exposes the PayPal tools this app calls.
 * It does not call the PayPal API. Live sandbox create/capture is untested here
 * because this environment has no Sandbox credentials.
 */
describe("PayPal Agent Toolkit", () => {
  it("registers order, shipment, and refund tools in sandbox", async () => {
    const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
    const toolkit = new PayPalAgentToolkit({
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      configuration: {
        actions: {
          orders: { create: true, get: true, capture: true },
          shipment: { create: true, get: true, update: true },
          payments: { createRefund: true, getRefunds: true },
        },
        context: { sandbox: true },
      },
    });
    const tools = toolkit.getTools();
    for (const name of [
      "create_order",
      "get_order",
      "pay_order",
      "create_shipment_tracking",
      "get_shipment_tracking",
      "create_refund",
    ]) {
      expect(tools[name], name).toBeTruthy();
    }
    const client = toolkit.client as unknown as { _isSandbox?: boolean };
    expect(client._isSandbox).toBe(true);
  });
});
