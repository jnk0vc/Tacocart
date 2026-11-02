/* TacoCart Concierge widget
 * Drop-in:
 *   <script src="https://HOST/widget.js" data-recipe="miso-chicken-tacos" defer></script>
 * Or declare the element yourself (the demo page does this):
 *   <tacocart-concierge recipe="miso-chicken-tacos"></tacocart-concierge>
 *   <script src="https://HOST/widget.js" defer></script>
 * Optional data-api="https://HOST" when the script is hosted somewhere else.
 */
(function () {
  if (window.__tacocartConcierge) return;
  window.__tacocartConcierge = true;

  const COPY = {
    en: {
      launcher: "Shop this recipe",
      title: "TacoCart",
      kicker: "Concierge",
      close: "Close",
      send: "Send",
      placeholder: "Make this for 4, mild…",
      empty: "I can scale this recipe, gather a cart, and open a PayPal Sandbox order.",
      cart: "Cart",
      subtotal: "Subtotal",
      shipping: "Shipping",
      total: "Total",
      free: "Free",
      pay: "Complete sandbox payment",
      payNote: "A mock stand-in. PayPal JS SDK v6 loads when a Sandbox client id is set.",
      preparing: "Preparing PayPal…",
      paid: "Paid",
      order: "Order",
      capture: "Capture",
      planned: "Planned PayPal call · not sent",
      agent: "AI agent",
      guide: "Scripted guide",
      sandbox: "Sandbox",
      categories: { kit: "Kit", ingredient: "Ingredient", tool: "Tool" },
      suggestionsLabel: "Suggestions",
    },
    ja: {
      launcher: "このレシピを買う",
      title: "TacoCart",
      kicker: "コンシェルジュ",
      close: "閉じる",
      send: "送信",
      placeholder: "4人分、辛さ控えめ…",
      empty: "人数と辛さに合わせて、カートを作り、PayPalサンドボックスの注文を用意します。",
      cart: "カート",
      subtotal: "小計",
      shipping: "送料",
      total: "合計",
      free: "無料",
      pay: "サンドボックス決済を完了",
      payNote: "モックのボタンです。サンドボックスのクライアントIDがあると PayPal JS SDK v6 を読み込みます。",
      preparing: "PayPalを準備しています…",
      paid: "支払済",
      order: "注文",
      capture: "売上",
      planned: "PayPal呼び出しの予定 · 未送信",
      agent: "AIエージェント",
      guide: "台本ガイド",
      sandbox: "サンドボックス",
      categories: { kit: "キット", ingredient: "材料", tool: "道具" },
      suggestionsLabel: "提案",
    },
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(amount, locale) {
    return new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  function scriptConfig() {
    const script = document.querySelector("script[src*='widget.js']");
    return {
      recipe: script?.getAttribute("data-recipe") || "",
      api: (script?.getAttribute("data-api") || "").replace(/\/$/, ""),
    };
  }

  function apiBase() {
    const configured = scriptConfig().api;
    if (configured) return configured;
    const script = document.querySelector("script[src*='widget.js']");
    if (script?.src) {
      try {
        return new URL(script.src, window.location.href).origin;
      } catch (error) {
        return "";
      }
    }
    return "";
  }

  const PAYPAL_SDK = {
    sandbox: "https://www.sandbox.paypal.com/web-sdk/v6/core",
    live: "https://www.paypal.com/web-sdk/v6/core",
  };

  function sdkUrl(config) {
    if (config?.sdkUrl) return config.sdkUrl;
    return config?.paypalEnvironment === "live" ? PAYPAL_SDK.live : PAYPAL_SDK.sandbox;
  }

  function loadPayPalSdk(url) {
    if (window.paypal?.createInstance) return Promise.resolve(window.paypal);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-tcc-paypal-sdk]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.paypal), { once: true });
        existing.addEventListener("error", () => reject(new Error("PayPal JS SDK v6 failed to load")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.tccPaypalSdk = "1";
      script.onload = () => resolve(window.paypal);
      script.onerror = () => reject(new Error("PayPal JS SDK v6 failed to load"));
      document.head.appendChild(script);
    });
  }

  class TacoCartConcierge extends HTMLElement {
    constructor() {
      super();
      this.state = {
        open: false,
        locale: "en",
        sessionId: null,
        messages: [],
        cart: null,
        order: null,
        capture: null,
        pending: null,
        suggestions: [],
        config: null,
        busy: false,
        error: "",
      };
      this.shadow = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
      this.recipeId = this.getAttribute("recipe") || scriptConfig().recipe;
      this.render();
      this.loadConfig();
      this._onKey = (event) => {
        if (event.key === "Escape" && this.state.open) {
          this.state.open = false;
          this.render();
        }
      };
      document.addEventListener("keydown", this._onKey);
    }

    disconnectedCallback() {
      document.removeEventListener("keydown", this._onKey);
    }

    text() {
      return COPY[this.state.locale] || COPY.en;
    }

    async loadConfig() {
      try {
        const response = await fetch(`${apiBase()}/api/config`);
        this.state.config = await response.json();
      } catch (error) {
        this.state.config = { paypalMock: true, llmEnabled: false, paypalEnvironment: "sandbox" };
      }
      this.render();
    }

    render() {
      this._renderGen = (this._renderGen || 0) + 1;
      const renderGen = this._renderGen;
      const draft = this.shadow.getElementById("tcc-input")?.value || "";
      const t = this.text();
      const locale = this.state.locale;
      const mode = this.state.config?.llmEnabled ? t.agent : t.guide;
      const environment = this.state.config?.paypalEnvironment === "live" ? "Live" : t.sandbox;
      this.shadow.innerHTML = `
        <style>${STYLES}</style>
        <button class="launcher" type="button" aria-expanded="${this.state.open ? "true" : "false"}" aria-controls="tcc-panel">
          <span class="mark" aria-hidden="true"></span>
          ${escapeHtml(t.launcher)}
        </button>
        <section class="panel ${this.state.open ? "open" : ""}" id="tcc-panel" role="dialog" aria-label="${escapeHtml(t.title)}" ${this.state.open ? "" : "hidden"}>
          <header class="bar">
            <div>
              <p class="kicker">${escapeHtml(t.kicker)}</p>
              <h2>${escapeHtml(t.title)}</h2>
            </div>
            <div class="bar-actions">
              <div class="lang" role="group" aria-label="Language">
                <button type="button" data-locale="en" class="${locale === "en" ? "on" : ""}">EN</button>
                <button type="button" data-locale="ja" class="${locale === "ja" ? "on" : ""}">日本</button>
              </div>
              <button class="icon" type="button" data-close aria-label="${escapeHtml(t.close)}">×</button>
            </div>
          </header>
          <p class="status"><span>${escapeHtml(environment)}</span><span>${escapeHtml(mode)}</span></p>
          <div class="log" id="tcc-log">${this.messagesHtml()}</div>
          ${this.trayHtml()}
          <form class="composer" id="tcc-form">
            <input id="tcc-input" name="message" maxlength="2000" autocomplete="off" placeholder="${escapeHtml(t.placeholder)}" aria-label="${escapeHtml(t.placeholder)}" ${this.state.busy ? "disabled" : ""} />
            <button type="submit" ${this.state.busy ? "disabled" : ""}>${escapeHtml(t.send)}</button>
          </form>
        </section>
      `;
      this.bind();
      if (this.state.open) {
        const input = this.shadow.getElementById("tcc-input");
        const log = this.shadow.getElementById("tcc-log");
        if (log) log.scrollTop = log.scrollHeight;
        if (input) {
          if (draft) input.value = draft;
          input.focus();
        }
        this.mountPayPal(renderGen);
      }
    }

    messagesHtml() {
      const t = this.text();
      const chips = (this.state.suggestions.length ? this.state.suggestions : defaultSuggestions(this.state.locale))
        .map((item) => `<button type="button" class="chip" data-suggest="${escapeHtml(item)}">${escapeHtml(item)}</button>`)
        .join("");
      const bubbles = this.state.messages
        .map((message) => `<div class="bubble ${message.role}">${escapeHtml(message.content)}</div>`)
        .join("");
      const empty = this.state.messages.length
        ? ""
        : `<div class="empty"><p>${escapeHtml(t.empty)}</p><div class="chips" aria-label="${escapeHtml(t.suggestionsLabel)}">${chips}</div></div>`;
      const laterChips =
        this.state.messages.length && this.state.suggestions.length
          ? `<div class="chips">${chips}</div>`
          : "";
      const error = this.state.error ? `<p class="error">${escapeHtml(this.state.error)}</p>` : "";
      return `${empty}${bubbles}${laterChips}${error}`;
    }

    trayHtml() {
      const cart = this.state.cart;
      if (!cart) return "";
      const t = this.text();
      const locale = this.state.locale;
      const lines = cart.lines
        .map((line) => {
          const name = line.name?.[locale] || line.name?.en || line.sku;
          return `<li>
            <span class="tag ${escapeHtml(line.category)}">${escapeHtml(t.categories[line.category] || line.category)}</span>
            <span class="name">${escapeHtml(name)}</span>
            <span class="nums">${line.quantity} × ${money(line.unitPrice, locale)}</span>
            <strong>${money(line.lineTotal, locale)}</strong>
          </li>`;
        })
        .join("");
      const pending = this.state.pending
        ? `<div class="pending"><p>${escapeHtml(t.planned)}</p><code>${escapeHtml(this.state.pending.tool)}</code></div>`
        : "";
      const pay = this.payHtml();
      return `<div class="tray">
        <div class="tray-head"><span>${escapeHtml(t.cart)}</span><strong>${money(cart.total, locale)}</strong></div>
        <ul>${lines}</ul>
        <dl>
          <div><dt>${escapeHtml(t.subtotal)}</dt><dd>${money(cart.subtotal, locale)}</dd></div>
          <div><dt>${escapeHtml(t.shipping)}</dt><dd>${cart.shipping === 0 ? escapeHtml(t.free) : money(cart.shipping, locale)}</dd></div>
          <div class="grand"><dt>${escapeHtml(t.total)}</dt><dd>${money(cart.total, locale)}</dd></div>
        </dl>
        ${pay}
        ${pending}
      </div>`;
    }

    payHtml() {
      const t = this.text();
      if (this.state.capture) {
        return `<p class="paid">${escapeHtml(t.paid)} · ${escapeHtml(t.order)} ${escapeHtml(this.state.capture.orderId)} · ${escapeHtml(t.capture)} ${escapeHtml(this.state.capture.id)}</p>`;
      }
      if (!this.state.order) return "";
      const mock = !this.state.config || this.state.config.paypalMock || !this.state.config.paypalClientId;
      if (mock) {
        return `<button class="mock-pay" type="button" data-mock-pay>${escapeHtml(t.pay)}</button><p class="fine">${escapeHtml(t.payNote)}</p>`;
      }
      return `<div id="tcc-pay"><p class="fine">${escapeHtml(t.preparing)}</p></div>`;
    }

    bind() {
      this.shadow.querySelector(".launcher")?.addEventListener("click", () => {
        this.state.open = !this.state.open;
        this.render();
        if (this.state.open) this.shadow.getElementById("tcc-input")?.focus();
      });
      this.shadow.querySelector("[data-close]")?.addEventListener("click", () => {
        this.state.open = false;
        this.render();
      });
      this.shadow.querySelectorAll("[data-locale]").forEach((button) => {
        button.addEventListener("click", () => {
          this.state.locale = button.getAttribute("data-locale") === "ja" ? "ja" : "en";
          this.render();
        });
      });
      this.shadow.querySelectorAll("[data-suggest]").forEach((button) => {
        button.addEventListener("click", () => this.send(button.getAttribute("data-suggest") || ""));
      });
      this.shadow.querySelector("[data-mock-pay]")?.addEventListener("click", () => {
        if (this.state.order) this.capture(this.state.order.id);
      });
      this.shadow.getElementById("tcc-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = this.shadow.getElementById("tcc-input");
        const text = input?.value.trim();
        if (text) this.send(text);
      });
    }

    async send(text) {
      if (!this.recipeId || this.state.busy) return;
      this.state.busy = true;
      this.state.error = "";
      this.state.messages.push({ role: "user", content: text });
      this.state.open = true;
      const field = this.shadow.getElementById("tcc-input");
      if (field) field.value = "";
      this.render();
      try {
        const response = await fetch(`${apiBase()}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: this.state.sessionId,
            recipeId: this.recipeId,
            message: text,
            locale: this.state.locale,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The concierge could not reply.");
        this.state.sessionId = data.sessionId;
        this.state.messages.push({ role: "assistant", content: data.reply });
        this.state.cart = data.cart;
        this.state.order = data.order;
        this.state.capture = data.capture;
        this.state.pending = data.pendingAction;
        this.state.suggestions = data.suggestions || [];
      } catch (error) {
        this.state.error = error.message || "The concierge could not reply.";
      } finally {
        this.state.busy = false;
        this.render();
      }
    }

    async capture(orderId) {
      if (!this.state.sessionId || this.state.busy) return;
      this.state.busy = true;
      this.state.error = "";
      this.render();
      try {
        const response = await fetch(`${apiBase()}/api/orders/${encodeURIComponent(orderId)}/capture`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: this.state.sessionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Capture failed.");
        this.state.capture = data.capture;
        this.state.order = data.order;
        if (data.reply) this.state.messages.push({ role: "assistant", content: data.reply });
        this.state.suggestions = this.state.locale === "ja" ? ["いつ届きますか？", "1つ返品したい"] : ["When will it arrive?", "I want to return one item"];
      } catch (error) {
        this.state.error = error.message || "Capture failed.";
      } finally {
        this.state.busy = false;
        this.render();
      }
    }

    ensureOrderPromise() {
      if (this.state.order?.status === "CREATED") return Promise.resolve({ orderId: this.state.order.id });
      return fetch(`${apiBase()}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.state.sessionId }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not create the PayPal order.");
        this.state.order = data.order;
        return { orderId: data.order.id };
      });
    }

    async mountPayPal(renderGen) {
      const slot = this.shadow.getElementById("tcc-pay");
      const config = this.state.config;
      if (!slot || !config || config.paypalMock || !config.paypalClientId || !this.state.order) return;
      try {
        const paypal = await loadPayPalSdk(sdkUrl(config));
        if (renderGen !== this._renderGen) return;
        const sdk = await paypal.createInstance({
          clientId: config.paypalClientId,
          components: ["paypal-payments"],
          pageType: "product-details",
          locale: this.state.locale === "ja" ? "ja-JP" : "en-US",
        });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (!methods.isEligible("paypal")) {
          slot.textContent = this.state.locale === "ja" ? "このブラウザではPayPalを利用できません。" : "PayPal is not eligible in this browser.";
          return;
        }
        const paymentSession = sdk.createPayPalOneTimePaymentSession({
          onApprove: async (data) => {
            await this.capture(data.orderId || this.state.order.id);
          },
          onCancel: () => {
            const note = this.state.locale === "ja" ? "PayPalでの承認はキャンセルされました。" : "PayPal approval was cancelled.";
            this.state.messages.push({ role: "assistant", content: note });
            this.render();
          },
          onError: (error) => {
            this.state.error = error?.message || "PayPal reported an error.";
            this.render();
          },
        });
        const button = document.createElement("paypal-button");
        button.setAttribute("type", "pay");
        button.className = "paypal-gold";
        button.addEventListener("click", async () => {
          try {
            await paymentSession.start({ presentationMode: "auto" }, this.ensureOrderPromise());
          } catch (error) {
            this.state.error = error?.message || "PayPal could not start.";
            this.render();
          }
        });
        if (renderGen !== this._renderGen) return;
        slot.replaceChildren(button);
      } catch (error) {
        slot.textContent = error.message || "PayPal JS SDK v6 failed to load.";
      }
    }
  }

  function defaultSuggestions(locale) {
    return locale === "ja"
      ? ["4人分、辛さ控えめ", "2人分のまま、辛口"]
      : ["Make this for 4 people, mild spice", "Keep it for 2, but make it hot"];
  }

  const STYLES = `
    :host { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; width: 0; height: 0; font-family: Outfit, "Avenir Next", "Segoe UI", sans-serif; color: #1d1915; }
    :host([lang="ja"]) { font-family: "Shippori Mincho", Outfit, serif; }
    * { box-sizing: border-box; }
    button, input { font: inherit; color: inherit; }
    .launcher { position: absolute; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; border: 0; cursor: pointer; background: #c4452d; color: #fbf7f1; border-radius: 999px; padding: 14px 18px 14px 14px; box-shadow: 0 16px 40px rgba(120, 36, 20, 0.28); letter-spacing: 0.01em; white-space: nowrap; }
    .launcher:hover { background: #a83822; }
    .mark { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #f4efe6 0 38%, #b5813a 39% 70%, #2d4036 71%); display: inline-block; }
    .panel { position: absolute; right: 0; bottom: 68px; width: min(400px, calc(100vw - 28px)); height: min(700px, calc(100vh - 110px)); display: none; flex-direction: column; background: #fbf7f1; border: 1px solid rgba(29,25,21,.12); border-radius: 24px; box-shadow: 0 30px 80px rgba(40, 24, 12, .24); overflow: hidden; }
    .panel.open { display: flex; }
    .bar { display: flex; justify-content: space-between; gap: 12px; align-items: start; padding: 16px 16px 8px; }
    .kicker { margin: 0; letter-spacing: .16em; text-transform: uppercase; font-size: 11px; color: #c4452d; }
    h2 { margin: 2px 0 0; font-family: Fraunces, "Iowan Old Style", Palatino, Georgia, serif; font-weight: 650; font-size: 28px; letter-spacing: -0.04em; }
    .bar-actions { display: flex; gap: 8px; align-items: center; }
    .lang { display: flex; border: 1px solid rgba(29,25,21,.14); border-radius: 999px; overflow: hidden; }
    .lang button, .icon { background: transparent; border: 0; cursor: pointer; }
    .lang button { padding: 6px 10px; font-size: 12px; letter-spacing: .08em; }
    .lang button.on { background: #1d1915; color: #fbf7f1; }
    .icon { width: 32px; height: 32px; border-radius: 50%; font-size: 22px; line-height: 1; }
    .status { display: flex; gap: 8px; margin: 0; padding: 0 16px 10px; }
    .status span { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #6d645b; border: 1px solid rgba(29,25,21,.12); border-radius: 999px; padding: 4px 8px; }
    .log { flex: 1; overflow: auto; padding: 4px 16px 12px; display: flex; flex-direction: column; gap: 10px; }
    .empty p { margin: 8px 0 12px; line-height: 1.45; }
    .bubble { max-width: 92%; padding: 10px 12px; border-radius: 16px; line-height: 1.45; white-space: pre-wrap; }
    .bubble.user { align-self: flex-end; background: #1d1915; color: #fbf7f1; border-bottom-right-radius: 6px; }
    .bubble.assistant { align-self: flex-start; background: #f4efe6; border: 1px solid rgba(29,25,21,.08); border-bottom-left-radius: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border: 1px solid rgba(29,25,21,.14); background: transparent; border-radius: 999px; padding: 7px 10px; cursor: pointer; text-align: left; }
    .chip:hover { border-color: #c4452d; color: #c4452d; }
    .error { margin: 0; color: #9d2b1b; font-size: 13px; }
    .tray { border-top: 1px solid rgba(29,25,21,.1); background: #fffdf9; padding: 12px 16px 10px; max-height: 46%; overflow: auto; }
    .tray-head { display: flex; justify-content: space-between; align-items: baseline; font-family: Fraunces, Palatino, Georgia, serif; font-size: 18px; }
    .tray ul { list-style: none; margin: 8px 0; padding: 0; }
    .tray li { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: "tag name price" "tag nums price"; gap: 0 8px; padding: 7px 0; border-top: 1px solid rgba(29,25,21,.08); }
    .tag { grid-area: tag; align-self: center; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; border-radius: 999px; padding: 3px 6px; }
    .tag.kit { background: #e5efe8; color: #2d4036; }
    .tag.ingredient { background: #f6ead4; color: #7a5720; }
    .tag.tool { background: #f8e4de; color: #9d2b1b; }
    .name { grid-area: name; }
    .nums { grid-area: nums; color: #6d645b; font-size: 12px; }
    .tray li strong { grid-area: price; align-self: center; font-variant-numeric: tabular-nums; }
    dl { margin: 0; }
    dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: #6d645b; padding-top: 3px; }
    dl .grand { color: #1d1915; font-size: 15px; padding-top: 6px; }
    dt, dd { margin: 0; }
    .mock-pay, .composer button { cursor: pointer; border: 0; }
    .mock-pay { width: 100%; margin-top: 10px; background: #1d1915; color: #fbf7f1; border-radius: 12px; padding: 12px; }
    .mock-pay:hover { background: #c4452d; }
    .fine { margin: 6px 0 0; color: #6d645b; font-size: 12px; line-height: 1.4; }
    .paid { margin: 10px 0 0; background: #e5efe8; color: #2d4036; border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.4; }
    .pending { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(29,25,21,.16); }
    .pending p { margin: 0 0 4px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6d645b; }
    code { font-size: 12px; }
    paypal-button { display: block; margin-top: 10px; }
    .composer { display: flex; gap: 8px; padding: 10px; border-top: 1px solid rgba(29,25,21,.1); background: #fbf7f1; }
    .composer input { flex: 1; border: 1px solid rgba(29,25,21,.16); background: white; border-radius: 12px; padding: 12px; outline: none; }
    .composer input:focus { border-color: #c4452d; }
    .composer button { background: #c4452d; color: #fbf7f1; border-radius: 12px; padding: 0 14px; }
    .composer button:disabled, .composer input:disabled { opacity: .6; }
    @media (max-width: 680px) {
      :host { right: 0; bottom: 0; }
      .launcher { right: 14px; bottom: 14px; }
      .panel { width: 100vw; height: 100dvh; right: 0; bottom: 0; border-radius: 0; }
    }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
  `;

  function boot() {
    if (!customElements.get("tacocart-concierge")) customElements.define("tacocart-concierge", TacoCartConcierge);
    if (!document.querySelector("tacocart-concierge")) {
      const recipe = scriptConfig().recipe;
      if (!recipe || !document.body) return;
      const element = document.createElement("tacocart-concierge");
      element.setAttribute("recipe", recipe);
      document.body.appendChild(element);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
