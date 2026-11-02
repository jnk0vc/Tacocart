# TacoCart Concierge

An embeddable chat widget for recipe and content sites. A reader on a recipe page says “make this for 4 people, mild spice.” The concierge scales the recipe, builds a cart of kits, ingredients, and tools from a catalog, and creates a **PayPal Sandbox** order with the PayPal Agent Toolkit. The same widget then takes payment with **PayPal JS SDK v6** buttons. After purchase, “When will it arrive?” and “I want to return one item” are recognized and drafted — those PayPal calls are stubbed for the next milestone.

This is an entry for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). The first showcase is meant to sit on a Japanese taco recipe site; the widget is a drop-in for any article page.

The demo recipes are original. They are not copied from uchitaco.com.

## Run it locally

Node.js 20 or newer.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The miso chicken article has the widget in the corner. Two more recipes are linked at the top.

Without keys, the app still runs:

- PayPal orders are **mock** orders (no call to PayPal). The gold PayPal button is replaced by a clearly labeled sandbox stand-in that captures the mock order.
- The reply is a **scripted guide**, not an LLM. The badge in the widget says “Scripted guide”.

A judged demo needs both a PayPal Sandbox app and one LLM key. Put them in `.env.local` (never commit that file) and restart `npm run dev`. The badge switches to “AI agent”, and the widget loads the real v6 button.

```bash
npm test
npm run build
npm start
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | For real Sandbox checkout | REST app client id. Public. The widget receives it from `/api/config`. |
| `PAYPAL_CLIENT_SECRET` | For real Sandbox checkout | Server only. Never put this in the widget or in `NEXT_PUBLIC_*`. |
| `OPENAI_API_KEY` | One LLM key | Used when `LLM_PROVIDER=openai` (the default). |
| `ANTHROPIC_API_KEY` | One LLM key | Used when `LLM_PROVIDER=anthropic`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | One LLM key | Used when `LLM_PROVIDER=google`. This is the Vercel AI SDK env name. |
| `LLM_PROVIDER` | No | `openai` (default), `anthropic`, or `google`. |
| `LLM_MODEL` | No | Overrides the default model id. Defaults: `gpt-4o-mini`, `claude-3-5-haiku-latest`, `gemini-2.0-flash`. If a provider returns model-not-found, set a current id. |
| `LLM_MODE` | No | `auto` (default) uses the agent when the selected key exists. `fallback` forces the scripted guide. |
| `PAYPAL_ENVIRONMENT` | No | `sandbox` (default) or `live`. Hackathon demos should stay on sandbox. |
| `PAYPAL_MODE` | No | `mock`, `live`, or empty. Empty means mock when either PayPal credential is missing, otherwise the Agent Toolkit. |
| `PAYPAL_RETURN_URL` | No | Full-page redirect return URL. Defaults to the request `Origin`, then `http://localhost:3000`. |
| `PAYPAL_CANCEL_URL` | No | Full-page redirect cancel URL. Same default as the return URL. |
| `WIDGET_ALLOWED_ORIGIN` | No | CORS origin for the API. Default `*`. |
| `TACOCART_DEBUG` | No | Set to `1` to log tool calls on the server. |

The owner needs to provide, at minimum:

1. `PAYPAL_CLIENT_ID`
2. `PAYPAL_CLIENT_SECRET`
3. One of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY` (and `LLM_PROVIDER` if it is not OpenAI)

## PayPal Sandbox accounts

1. Open the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) and sign in (or create a PayPal account).
2. Switch the dashboard to **Sandbox**.
3. Go to **Apps & Credentials** and create an app (or open the default app). Copy the **Client ID** and **Secret** into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
4. Go to **Testing Tools → Sandbox Accounts**. PayPal creates a **Business** account (the merchant this app’s credentials belong to) and a **Personal** account (the buyer).
5. Open the personal account and view its system-generated password. When the v6 button opens, log in with that personal sandbox email and password.
6. Leave `PAYPAL_ENVIRONMENT=sandbox`. The Agent Toolkit’s client defaults to the **live** API unless `context.sandbox` is set. This app sets it from `PAYPAL_ENVIRONMENT`.

No live charges are involved when both the app credentials and the buyer are sandbox accounts.

## Try the demo

1. Open a recipe. Click **Shop this recipe**.
2. Send `Make this for 4 people, mild spice` (or `4人分、辛さ控えめ`). The EN/JA control switches the widget language.
3. Read the cart. Kits cover the core ingredients, leftover items are added from the catalog, sugar stays in the pantry, and a skillet is included unless you say you already have one.
4. Pay. With Sandbox keys, use the PayPal button and the personal sandbox buyer. Without keys, use **Complete sandbox payment**.
5. Ask `When will it arrive?` and `I want to return the skillet`. The widget shows the PayPal tool that will be called later. Nothing is sent.

Say `I already have a skillet` with the serving request to drop the tool line.

## Embed on another site

```html
<script
  src="https://YOUR_HOST/widget.js"
  data-recipe="miso-chicken-tacos"
  defer
></script>
```

The script’s origin is the API origin. Override it with `data-api="https://YOUR_HOST"` if needed. You can also place the element yourself:

```html
<tacocart-concierge recipe="miso-chicken-tacos"></tacocart-concierge>
<script src="https://YOUR_HOST/widget.js" defer></script>
```

Recipe ids in this repo: `miso-chicken-tacos`, `yuzu-shrimp-tacos`, `kinpira-mushroom-tacos`.

The widget talks to:

- `POST /api/chat`
- `POST /api/orders`
- `POST /api/orders/:orderId/capture`
- `GET /api/config`

Prices are computed on the server from `data/catalog.json`. The browser cannot set the amount.

## Deploy

**Target: Next.js on Render**, via [`render.yaml`](render.yaml).

Cloudflare Workers was the preferred host. It is not the target, because `@paypal/agent-toolkit@1.11.0` is a Node 18+ CommonJS package. Its AI SDK entry `require()`s `axios`, Node `buffer`, Node `os`, `debug`, and `@paypal/paypal-server-sdk` (an APIMatic axios client). PayPal’s own toolkit quickstart is a Next.js app. Workers’ Node compatibility covers many of those modules in 2026, but bundling this CJS axios stack into a Worker is an untested checkout risk, and a missed `context.sandbox` flag would hit the live PayPal API (the toolkit default). Render runs the Node server as-is and is a hackathon sponsor. API routes set `runtime = "nodejs"`.

Create a Render web service from `render.yaml`, then set the secret env vars in the dashboard. Set `PAYPAL_RETURN_URL` and `PAYPAL_CANCEL_URL` to the public `https://` origin if you want a full-page redirect fallback. The free instance sleeps when idle.

`next start` listens on `0.0.0.0` and Render’s `PORT`.

## How it is built

- **Catalog and recipes.** `data/catalog.json` and `data/recipes.json`.
- **Scaling and cart.** `lib/scale.ts` and `lib/cart.ts`. Serving math and prices do not depend on the model. A kit is used when it covers at least 60% of the shoppable ingredients. Shipping is $6.50, free at $65.
- **Agent.** Vercel AI SDK `ai@4.3.19` (the major version the toolkit depends on) with `@ai-sdk/openai`, `@ai-sdk/anthropic`, or `@ai-sdk/google`. Tools: `scale_recipe`, `build_cart`, `create_paypal_order`, `get_order`. `create_paypal_order` calls the toolkit’s `create_order` with the server cart. The model does not pass prices. If the model skips a tool, the server still scales, builds, and creates the order from the parsed request.
- **Buttons.** PayPal JS SDK v6 (`https://www.sandbox.paypal.com/web-sdk/v6/core`). `createPayPalOneTimePaymentSession`, then `start({ presentationMode: "auto" }, Promise<{ orderId }>)`. Approval posts to the capture route, which calls the toolkit’s `pay_order`.
- **Sessions.** In memory, per Node process. Fine for a single demo instance. Not durable across restarts or multiple instances.
- **Tracking and refunds.** `lib/flows.ts` recognizes the questions and returns the exact toolkit arguments. `get_shipment_tracking` and `create_refund` are not executed. See the TODOs in that file.

Currency is USD only. Toolkit 1.11.0’s `create_order` schema accepts `USD` and no other code.

## What was tested, and what was not

Tested in this repo, without PayPal or LLM credentials:

- Scaling, spice swaps, kit selection, pantry exclusion, shipping, and PayPal order payload prices (`npm test`).
- The mock order id shape, mock capture, and the tracking/refund stubs.
- The widget script contains the v6 sandbox URL, the one-time payment session, and `presentationMode: "auto"`.
- `npm run build`.
- The installed toolkit registers `create_order`, `get_order`, `pay_order`, `create_shipment_tracking`, `get_shipment_tracking`, and `create_refund`, and sandbox mode is on. That test does not call PayPal.

Not tested, because this environment has no Sandbox buyer and no LLM key:

- A real `create_order` / `pay_order` round trip against `api-m.sandbox.paypal.com`.
- The v6 button popup, eligibility check, and buyer login.
- A live `generateText` tool loop. The scripted guide calls the same scale, cart, and order functions the agent tools call.

Set `PAYPAL_MODE=mock` to force mocks even after keys are present.

## What remains

- Run the Sandbox buyer through the v6 button and confirm capture ids.
- Execute `create_shipment_tracking` / `get_shipment_tracking` after capture, then answer “when will it arrive?” with the carrier status.
- Execute `create_refund` for a chosen line (partial amount) after the reader confirms.
- Persist sessions (the in-memory map dies on restart).
- Stream the agent reply.
- Let the reader remove a line before paying.
- Embed the script on uchitaco.com.
- Record the demo video and deploy the public Render URL.

## License

[MIT](LICENSE).
