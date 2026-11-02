import { randomBytes } from "node:crypto";
import type { PayPalCreateOrderArgs } from "@/lib/paypal-order";
import { roundMoney } from "@/lib/money";

export type GatewayOrder = {
  id: string;
  status: string;
  mock: boolean;
};

export type GatewayCapture = {
  id: string;
  orderId: string;
  status: string;
  mock: boolean;
  amount?: { currencyCode: string; value: string };
};

type StoredOrder = GatewayOrder & {
  value: string;
  capture?: GatewayCapture;
};

type PayPalTool = {
  execute?: (args: unknown) => Promise<unknown>;
};

export function isPayPalSandbox(): boolean {
  return (process.env.PAYPAL_ENVIRONMENT ?? "sandbox").toLowerCase() !== "live";
}

export function isPayPalMock(): boolean {
  const mode = (process.env.PAYPAL_MODE ?? "").toLowerCase();
  if (mode === "mock") return true;
  if (mode === "live") return false;
  return !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;
}

/**
 * The published toolkit defaults `context.sandbox` to false, which would
 * call the live PayPal API. Always pass the flag explicitly.
 */
export function paypalToolkitContext(): { sandbox: boolean; source: string } {
  return { sandbox: isPayPalSandbox(), source: "tacocart-concierge" };
}

function paypalId(length = 17): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(length);
  let id = "";
  for (let index = 0; index < length; index += 1) {
    id += alphabet[bytes[index]! % alphabet.length];
  }
  return id;
}

function orderValue(args: PayPalCreateOrderArgs): string {
  const items = args.items.reduce((sum, item) => sum + item.itemCost * item.quantity, 0);
  return roundMoney(items + args.shippingCost - args.discount).toFixed(2);
}

const globalOrders = globalThis as typeof globalThis & { __tacocartMockOrders?: Map<string, StoredOrder> };

function mockOrders(): Map<string, StoredOrder> {
  if (!globalOrders.__tacocartMockOrders) globalOrders.__tacocartMockOrders = new Map();
  return globalOrders.__tacocartMockOrders;
}

export function resetMockPayPal(): void {
  mockOrders().clear();
}

class MockPayPalGateway {
  readonly mock = true;

  async createOrder(args: PayPalCreateOrderArgs): Promise<GatewayOrder> {
    const order: StoredOrder = {
      id: paypalId(),
      status: "CREATED",
      mock: true,
      value: orderValue(args),
    };
    mockOrders().set(order.id, order);
    return { id: order.id, status: order.status, mock: true };
  }

  async getOrder(orderId: string): Promise<Record<string, unknown>> {
    const order = mockOrders().get(orderId);
    if (!order) throw new Error(`Mock PayPal order ${orderId} was not found.`);
    return {
      id: order.id,
      status: order.capture ? "COMPLETED" : order.status,
      mock: true,
      purchase_units: [{ amount: { currency_code: "USD", value: order.value } }],
    };
  }

  async captureOrder(orderId: string): Promise<GatewayCapture> {
    const order = mockOrders().get(orderId);
    if (!order) throw new Error(`Mock PayPal order ${orderId} was not found.`);
    if (order.capture) return order.capture;
    const capture: GatewayCapture = {
      id: paypalId(),
      orderId,
      status: "COMPLETED",
      mock: true,
      amount: { currencyCode: "USD", value: order.value },
    };
    order.status = "COMPLETED";
    order.capture = capture;
    return capture;
  }
}

function errorMessage(error: unknown): string {
  const record = error as { response?: { data?: { message?: string; details?: { description?: string }[] } }; message?: string };
  const detail = record?.response?.data?.details?.[0]?.description || record?.response?.data?.message;
  if (detail) return detail;
  if (error instanceof Error) return error.message;
  return "PayPal request failed.";
}

async function loadToolkitTools(): Promise<Record<string, PayPalTool>> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required when PAYPAL_MODE=live.");
  }
  const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/ai-sdk");
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: {
        orders: { create: true, get: true, capture: true },
        shipment: { create: true, get: true, update: true },
        payments: { createRefund: true, getRefunds: true },
      },
      context: paypalToolkitContext(),
    },
  });
  return toolkit.getTools() as Record<string, PayPalTool>;
}

async function runTool(name: string, args: unknown): Promise<unknown> {
  const tools = await loadToolkitTools();
  const tool = tools[name];
  if (!tool?.execute) {
    throw new Error(`PayPal Agent Toolkit tool "${name}" is not available.`);
  }
  try {
    return await tool.execute(args);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

function readOrder(raw: unknown): GatewayOrder {
  const record = (raw ?? {}) as { id?: string; status?: string };
  if (!record.id) throw new Error("PayPal create_order did not return an order id.");
  return { id: record.id, status: record.status || "CREATED", mock: false };
}

function readCapture(orderId: string, raw: unknown): GatewayCapture {
  const wrapped = raw as { response?: unknown; status?: string };
  const payload = (wrapped?.response ?? raw) as {
    purchase_units?: { payments?: { captures?: { id?: string; status?: string; amount?: { currency_code?: string; value?: string } }[] } }[];
  };
  const capture = payload?.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture?.id) {
    throw new Error("PayPal pay_order did not return a capture id. The order may still be awaiting buyer approval.");
  }
  return {
    id: capture.id,
    orderId,
    status: capture.status || "COMPLETED",
    mock: false,
    amount: capture.amount?.value
      ? { currencyCode: capture.amount.currency_code || "USD", value: capture.amount.value }
      : undefined,
  };
}

class AgentToolkitPayPalGateway {
  readonly mock = false;

  async createOrder(args: PayPalCreateOrderArgs): Promise<GatewayOrder> {
    return readOrder(await runTool("create_order", args));
  }

  async getOrder(orderId: string): Promise<unknown> {
    return runTool("get_order", { id: orderId });
  }

  async captureOrder(orderId: string): Promise<GatewayCapture> {
    return readCapture(orderId, await runTool("pay_order", { id: orderId }));
  }
}

export type PayPalGateway = MockPayPalGateway | AgentToolkitPayPalGateway;

let singleton: PayPalGateway | undefined;
let singletonMock: boolean | undefined;

export function getPayPalGateway(): PayPalGateway {
  const mock = isPayPalMock();
  if (!singleton || singletonMock !== mock) {
    singleton = mock ? new MockPayPalGateway() : new AgentToolkitPayPalGateway();
    singletonMock = mock;
  }
  return singleton;
}

export function resetPayPalGateway(): void {
  singleton = undefined;
  singletonMock = undefined;
  resetMockPayPal();
}
