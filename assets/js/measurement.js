/* Optional, consent-gated measurement. Booking operations never depend on this module. */
(function (root) {
  "use strict";
  if (root.RozaMeasurement) return;
  const raw = root.ROZA_MEASUREMENT_CONFIG || {};
  const id = String(raw.measurementId || "");
  const basePath = String(raw.siteBasePath || "/");
  const days = Number(raw.retentionDays);
  const enabled = raw.enabled === true && raw.provider === "ga4" && /^G-[A-Z0-9]{6,20}$/.test(id) &&
    raw.privacyApproved === true && raw.enhancedMeasurementDisabled === true && raw.advertisingFeaturesDisabled === true &&
    Array.isArray(raw.allowedOrigins) && raw.allowedOrigins.includes(root.location.origin) && root.location.protocol === "https:" &&
    /^\/(?:[a-z0-9_-]+\/)*$/.test(basePath) && Number.isInteger(days) && days >= 1 && days <= 180;
  const KEYS = { consent: "roza-measurement-consent-v1", campaign: "roza-measurement-campaign-v1", ledger: "roza-measurement-purchases-v1" };
  const TTL = days * 86400000;
  const slug = value => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(value);
  const campaigns = (Array.isArray(raw.campaigns) ? raw.campaigns : []).filter(item => item && slug(item.source) && slug(item.medium) && slug(item.campaign)).slice(0, 30).map(item => ({ source: item.source, medium: item.medium, campaign: item.campaign }));
  const state = { consent: "unset", revision: 0, loader: null, script: null, loaded: false, reloadRequired: false, bookingBusy: false, campaign: null, memoryLedger: new Set(), inflight: new Map(), ui: null };
  const result = reason => ({ accepted: false, reason });
  function read(key) { try { return JSON.parse(root.localStorage.getItem(key) || "null"); } catch (_) { return null; } }
  function write(key, value) { try { root.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function remove(key) { try { root.localStorage.removeItem(key); } catch (_) { /* Optional storage. */ } }
  function fresh(entry) { return entry && Number.isFinite(entry.at) && entry.at <= Date.now() && Date.now() - entry.at < TTL; }
  function allowed() { return enabled && state.consent === "granted"; }
  function page() {
    const name = root.location.pathname.split("/").pop();
    const type = name === "book.html" ? "booking" : name === "privacy.html" ? "privacy" : name === "" || name === "index.html" ? "home" : "other";
    const path = type === "booking" ? "book.html" : type === "privacy" ? "privacy.html" : "index.html";
    return { page_type: type, page_location: root.location.origin + basePath + path, page_title: "Roza's Guest House · " + type, page_referrer: "", ignore_referrer: true };
  }
  function findCampaign(value) { return campaigns.find(item => value && item.source === value.source && item.medium === value.medium && item.campaign === value.campaign) || null; }
  function captureCampaign() {
    const params = new URL(root.location.href).searchParams;
    const supplied = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id"].some(key => params.has(key));
    let selected = null;
    if (supplied) {
      selected = findCampaign({ source: params.get("utm_source"), medium: params.get("utm_medium"), campaign: params.get("utm_campaign") });
      if (selected) write(KEYS.campaign, { at: Date.now(), value: selected }); else remove(KEYS.campaign);
    } else {
      const saved = read(KEYS.campaign);
      if (fresh(saved)) selected = findCampaign(saved.value);
    }
    state.campaign = selected;
  }
  function campaignParams() {
    const item = state.campaign;
    return { campaign_source: item ? item.source : "", campaign_medium: item ? item.medium : "", campaign_name: item ? item.campaign : "", campaign_term: "", campaign_content: "", campaign_id: "" };
  }
  function tag() { root.rozaMeasurementLayer.push(arguments); }
  function loadTag() {
    if (!allowed()) return Promise.resolve(false);
    if (state.loader) return state.loader;
    root["ga-disable-" + id] = false;
    root.rozaMeasurementLayer = [];
    const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
    tag("consent", "default", denied);
    tag("consent", "update", Object.assign({}, denied, { analytics_storage: "granted" }));
    tag("set", Object.assign({}, page(), campaignParams(), { allow_google_signals: false, allow_ad_personalization_signals: false, ads_data_redaction: true, url_passthrough: false }));
    tag("js", new Date());
    tag("config", id, Object.assign({}, page(), campaignParams(), { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_prefix: "roza", cookie_domain: "none", cookie_path: "/", cookie_expires: days * 86400, cookie_update: false }));
    state.loader = new Promise(resolve => {
      let done = false;
      const finish = loaded => { if (done) return; done = true; root.clearTimeout(timer); state.loaded = loaded; resolve(loaded); };
      const timer = root.setTimeout(() => finish(false), 10000);
      const script = root.document.createElement("script");
      script.async = true; script.referrerPolicy = "no-referrer";
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id) + "&l=rozaMeasurementLayer";
      script.onload = () => finish(true); script.onerror = () => finish(false);
      state.script = script; root.document.head.appendChild(script);
    });
    return state.loader;
  }
  function band(value, limits, labels) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "unspecified";
    const index = limits.findIndex(limit => value <= limit); return index < 0 ? "unspecified" : labels[index];
  }
  function cleanEvent(name, details) {
    if (!["page_view", "search", "view_options", "select_option", "begin_booking", "enquiry", "contact"].includes(name)) return null;
    const input = details || {}, output = Object.assign({}, page(), campaignParams());
    if (["search", "view_options", "select_option", "begin_booking"].includes(name)) {
      output.guest_band = band(input.guests, [0, 2, 4, 8, 20], ["unspecified", "1-2", "3-4", "5-8", "9-20"]);
      output.stay_band = band(input.nights, [0, 3, 7, 14, 30], ["unspecified", "1-3", "4-7", "8-14", "15-30"]);
      output.room_category = ["CLASSIC", "PEAKMV", "PEAKBAL", "COTTAGE", "mixed"].includes(input.roomCategory) ? input.roomCategory : "unspecified";
      output.product_kind = ["single", "combination"].includes(input.productKind) ? input.productKind : "unspecified";
    }
    if (name === "view_options") output.options_band = band(input.optionCount, [0, 3, 7, 100], ["0", "1-3", "4-7", "8+"]);
    if (name === "view_options") output.availability = ["available", "unavailable", "error"].includes(input.availability) ? input.availability : "unspecified";
    if (name === "contact" || name === "enquiry") output.contact_channel = ["whatsapp", "email", "phone"].includes(input.channel) ? input.channel : "unspecified";
    if (name === "enquiry") output.enquiry_kind = ["stay", "group", "general"].includes(input.kind) ? input.kind : "general";
    return output;
  }
  async function emit(name, params) {
    if (!allowed()) return result(enabled ? "no_consent" : "disabled");
    const revision = state.revision;
    if (!await loadTag()) return result("tag_unavailable");
    if (!allowed() || revision !== state.revision) return result("consent_changed");
    tag("event", name, Object.assign({}, params, { send_to: id }));
    return { accepted: true, status: "queued_not_delivery_confirmed" };
  }
  async function track(name, details) {
    if (!allowed()) return result(enabled ? "no_consent" : "disabled");
    const params = cleanEvent(name, details);
    if (!params) return result("event_not_allowed");
    try { return await emit(name, params); } catch (_) { return result("measurement_unavailable"); }
  }
  function confirmedData(value) {
    if (!value || value.ok !== true || String(value.status || "").toLowerCase() !== "confirmed") return null;
    const identity = value.confirmationId || value.groupBookingId || value.bookingId;
    if (typeof identity !== "string" || !/^(?:BKG-\d{8}-\d{3,}|GRP-\d{8}-\d{6}-[A-Z0-9]{6})$/.test(identity)) return null;
    const group = identity.startsWith("GRP-");
    if (value.groupBookingId && value.groupBookingId !== identity) return null;
    if (group && (!Array.isArray(value.bookingIds) || !value.bookingIds.length || value.bookingIds.length !== Number(value.roomCount) || new Set(value.bookingIds).size !== value.bookingIds.length || value.bookingIds.some(item => typeof item !== "string" || !/^BKG-\d{8}-\d{3,}$/.test(item)))) return null;
    if (!group && (Number(value.roomCount) > 1 || Array.isArray(value.bookingIds) && value.bookingIds.length > 1)) return null;
    const gross = value.bookingValueOriginal;
    if ((typeof gross !== "number" && typeof gross !== "string") || typeof gross === "string" && !/^\d+(?:\.\d{1,2})?$/.test(gross) || !Number.isFinite(Number(gross)) || Number(gross) < 0 || Number(gross) > 10000000) return null;
    const amount = Number(gross), rounded = Math.round(amount * 100) / 100;
    if (Math.abs(amount - rounded) > 0.000001) return null;
    const currency = value.bookingCurrency || value.currency;
    if (!["EUR", "GBP", "GEL", "USD"].includes(currency)) return null;
    return { identity, value: rounded, currency, booking_kind: group ? "group" : "single" };
  }
  async function confirmedPurchase(value) {
    if (!allowed()) return result(enabled ? "no_consent" : "disabled");
    const data = confirmedData(value);
    if (!data) return result("invalid_confirmation");
    if (!root.crypto || !root.crypto.subtle || !root.TextEncoder) return result("hash_unavailable");
    const revision = state.revision;
    try {
      const digest = await root.crypto.subtle.digest("SHA-256", new root.TextEncoder().encode("roza-property-1898490|" + data.identity));
      const transactionId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!allowed() || revision !== state.revision) return result("consent_changed");
      if (state.inflight.has(transactionId)) return state.inflight.get(transactionId);
      const promise = (async () => {
        const saved = read(KEYS.ledger);
        const rows = Array.isArray(saved) ? saved.filter(row => fresh(row) && /^[a-f0-9]{64}$/.test(row.id)) : [];
        if (state.memoryLedger.has(transactionId) || rows.some(row => row.id === transactionId)) return result("already_recorded");
        const outcome = await emit("purchase", Object.assign({}, page(), campaignParams(), { transaction_id: transactionId, value: data.value, currency: data.currency, booking_kind: data.booking_kind }));
        if (!outcome.accepted || !allowed() || revision !== state.revision) return outcome.accepted ? result("consent_changed") : outcome;
        state.memoryLedger.add(transactionId);
        const current = read(KEYS.ledger);
        const merged = Array.isArray(current) ? current.filter(row => fresh(row) && /^[a-f0-9]{64}$/.test(row.id) && row.id !== transactionId) : rows;
        const persisted = write(KEYS.ledger, merged.concat({ id: transactionId, at: Date.now() }).slice(-500));
        return Object.assign({}, outcome, { dedupePersisted: persisted });
      })();
      state.inflight.set(transactionId, promise);
      try { return await promise; } finally { state.inflight.delete(transactionId); }
    } catch (_) { return result("measurement_unavailable"); }
  }
  function clearAnalyticsCookies() {
    try {
      const names = root.document.cookie.split(";").map(value => value.split("=")[0].trim()).filter(name => /^roza_ga(?:_|$)/.test(name));
      names.forEach(name => { root.document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax; Secure"; });
    } catch (_) { /* Browser cookie restrictions must not block withdrawal. */ }
  }
  function setConsent(choice) {
    if (!enabled) return result("disabled");
    if (!["granted", "denied"].includes(choice)) return result("invalid_choice");
    if (state.bookingBusy && choice === "granted") return result("booking_in_progress");
    if (choice === "granted" && state.reloadRequired) return result("reload_required");
    if (choice === "granted" && state.consent === "granted") return { accepted: true, consent: choice, reloadRequired: false };
    const wasGranted = state.consent === "granted";
    state.consent = choice; state.revision++;
    write(KEYS.consent, { choice, at: Date.now() });
    if (choice === "granted") {
      captureCampaign();
      track("page_view");
    } else {
      root["ga-disable-" + id] = true;
      if (root.rozaMeasurementLayer) root.rozaMeasurementLayer.length = 0;
      if (state.script) state.script.remove();
      if (wasGranted || state.loaded) clearAnalyticsCookies();
      state.reloadRequired = state.reloadRequired || wasGranted || state.loaded;
      state.campaign = null; state.memoryLedger.clear(); state.inflight.clear();
      remove(KEYS.campaign); remove(KEYS.ledger);
    }
    if (state.ui) { state.ui.panel.hidden = true; state.ui.preferences.focus(); }
    return { accepted: true, consent: choice, reloadRequired: choice === "denied" && state.reloadRequired };
  }
  function withdrawAndReload() {
    const outcome = setConsent("denied");
    if (outcome.reloadRequired && state.bookingBusy) return Object.assign({}, outcome, { reloadDeferred: true });
    if (outcome.reloadRequired) root.location.reload();
    return outcome;
  }
  function showPreferences() {
    if (!enabled || !state.ui) return false;
    state.ui.panel.hidden = false;
    state.ui.decline.textContent = state.bookingBusy ? "Stop analytics without reloading" : state.reloadRequired ? "Reload with analytics off" : state.consent === "granted" ? "Withdraw and reload" : "Decline analytics";
    state.ui.accept.disabled = state.bookingBusy || state.reloadRequired;
    state.ui.note.textContent = state.bookingBusy ? "You can stop analytics now. Reloading will wait until your booking outcome is confirmed." : state.reloadRequired ? "Analytics has stopped. Finish any unsent booking, then reload to remove the loaded tag." : state.consent === "granted" ? "Withdrawing reloads this page. Finish any unsent booking first." : "Your choice does not affect booking or contacting us.";
    (state.bookingBusy || state.reloadRequired ? state.ui.decline : state.ui.accept).focus();
    return true;
  }
  function setBookingBusy(busy) {
    state.bookingBusy = !!busy;
    if (!state.ui) return;
    state.ui.preferences.disabled = false;
    state.ui.accept.disabled = state.bookingBusy || state.reloadRequired;
    state.ui.decline.disabled = false;
    state.ui.decline.textContent = state.bookingBusy ? "Stop analytics without reloading" : state.reloadRequired ? "Reload with analytics off" : state.consent === "granted" ? "Withdraw and reload" : "Decline analytics";
    state.ui.note.textContent = state.bookingBusy ? "You can stop analytics now. Reloading will wait until your booking outcome is confirmed." : state.reloadRequired ? "Analytics has stopped. Reload to remove the loaded tag." : "Your choice does not affect booking or contacting us.";
  }
  function bindContactLinks() {
    root.document.addEventListener("click", event => {
      if (event.defaultPrevented || !event.target || typeof event.target.closest !== "function") return;
      const link = event.target.closest("a[href]");
      if (!link) return;
      try {
        const href = new URL(link.getAttribute("href"), root.location.href);
        const channel = href.protocol === "mailto:" ? "email" : href.protocol === "tel:" ? "phone" : ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(href.hostname) ? "whatsapp" : "";
        if (channel) track("contact", { channel });
      } catch (_) { /* Invalid links or optional measurement cannot interrupt navigation. */ }
    }, { passive: true });
  }
  function mount() {
    if (!enabled || state.ui || !root.document.body) return;
    const style = root.document.createElement("style");
    style.textContent = ".roza-measurement-panel{position:fixed;bottom:16px;left:16px;right:16px;z-index:100;max-width:560px;padding:20px;background:#fcf9f2;color:#203b30;border:1px solid #526959;border-radius:14px;box-shadow:0 8px 28px #0002;font:15px/1.5 system-ui,sans-serif}.roza-measurement-panel[hidden]{display:none}.roza-measurement-panel p{margin:0 0 12px}.roza-measurement-actions{display:flex;gap:10px;flex-wrap:wrap}.roza-measurement-choice{flex:1;padding:11px 14px;border:1px solid #203b30;border-radius:8px;background:#fff;color:#203b30;font:600 14px system-ui;cursor:pointer}.roza-measurement-link{color:#203b30}.roza-measurement-preferences{display:block;margin:12px auto;padding:9px 12px;background:#fcf9f2;color:#203b30;border:1px solid #526959;border-radius:8px;cursor:pointer}";
    root.document.head.appendChild(style);
    const panel = root.document.createElement("section"); panel.className = "roza-measurement-panel"; panel.setAttribute("aria-label", "Optional website analytics"); panel.hidden = state.consent !== "unset";
    const text = root.document.createElement("p"); text.textContent = "Optional Google Analytics helps us understand website use and confirmed booked value. It uses analytics cookies after you agree. Guest names, contact details and booking notes are excluded. Advertising features are disabled.";
    const note = root.document.createElement("p"); note.textContent = "Your choice does not affect booking or contacting us.";
    const privacy = root.document.createElement("a"); privacy.href = basePath + "privacy.html#optional-analytics"; privacy.className = "roza-measurement-link"; privacy.textContent = "Privacy and retention details";
    privacy.addEventListener("click", event => { if (state.bookingBusy) event.preventDefault(); });
    const actions = root.document.createElement("div"); actions.className = "roza-measurement-actions";
    const accept = root.document.createElement("button"), decline = root.document.createElement("button");
    [accept, decline].forEach(button => { button.type = "button"; button.className = "roza-measurement-choice"; actions.appendChild(button); });
    accept.textContent = "Accept analytics"; decline.textContent = "Decline analytics";
    accept.addEventListener("click", () => setConsent("granted")); decline.addEventListener("click", withdrawAndReload);
    [text, note, privacy, actions].forEach(element => panel.appendChild(element)); root.document.body.appendChild(panel);
    const preferences = root.document.createElement("button"); preferences.type = "button"; preferences.className = "roza-measurement-preferences"; preferences.textContent = "Analytics preferences"; preferences.addEventListener("click", showPreferences); root.document.body.appendChild(preferences);
    state.ui = { panel, accept, decline, note, preferences };
    setBookingBusy(state.bookingBusy);
    bindContactLinks();
  }
  root.RozaMeasurement = Object.freeze({ track, confirmedPurchase, showPreferences, setConsent, withdrawAndReload, setBookingBusy, status: () => ({ configured: enabled, consent: state.consent, tagLoaded: state.loaded, bookingBusy: state.bookingBusy, reloadRequired: state.reloadRequired }) });
  if (!enabled) return; // No analytics requests, preference reads, storage or UI while disabled.
  const saved = read(KEYS.consent);
  if (fresh(saved) && ["granted", "denied"].includes(saved.choice)) state.consent = saved.choice;
  if (state.consent === "granted") { captureCampaign(); track("page_view"); }
  else root["ga-disable-" + id] = true;
  root.addEventListener("storage", event => {
    if (event.key !== KEYS.consent || state.consent !== "granted") return;
    let choice = null;
    try { choice = JSON.parse(event.newValue || "null"); } catch (_) { /* Removed/invalid choice means stop. */ }
    if (fresh(choice) && choice.choice === "granted") return;
    setConsent("denied");
    showPreferences();
  });
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})(window);
