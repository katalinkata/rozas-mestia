/* Functional, same-tab search preferences only. Never stores guest/contact data. */
(function (root) {
  "use strict";
  const KEY = "roza-stay-context-v1";
  const categories = Object.freeze({ CLASSIC: "Classic · shared bathroom", PEAKMV: "Peak Mountain View", PEAKBAL: "Peak with Balcony", COTTAGE: "Peak Cottage" });
  const day = (value) => {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    const date = new Date(text + "T12:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : "";
  };
  function clean(input) {
    const value = input || {};
    const result = {};
    const checkIn = day(value.checkIn), checkOut = day(value.checkOut);
    if (checkIn) result.checkIn = checkIn;
    const nights = (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000;
    if (checkOut && (!checkIn || (nights > 0 && nights <= 30))) result.checkOut = checkOut;
    const guests = String(value.guests || "");
    if (/^\d+$/.test(guests) && Number(guests) >= 1 && Number(guests) <= 20) result.guests = String(Number(guests));
    const bed = String(value.bedSetup || "").toLowerCase().replace(/[ _-]+/g, " ").trim();
    const beds = { double: "Double", dbl: "Double", twin: "Twin", triple: "Triple", family: "Triple", "triple / family": "Triple", "best available": "Best available" };
    if (beds[bed]) result.bedSetup = beds[bed];
    if (Object.hasOwn(categories, String(value.category || ""))) result.category = value.category;
    return result;
  }
  function fromUrl(url) {
    const p = new URL(url, root.location.href).searchParams;
    return clean({ checkIn: p.get("checkin") || p.get("check_in"), checkOut: p.get("checkout") || p.get("check_out"), guests: p.get("guests"), bedSetup: p.get("bed_setup") || p.get("bed"), category: p.get("category") });
  }
  function read() {
    let saved = {};
    try { saved = clean(JSON.parse(root.sessionStorage.getItem(KEY) || "{}")); } catch (_) { /* Storage is optional. */ }
    // An explicit search URL is authoritative; do not mix its dates with an older stay.
    const p = new URL(root.location.href).searchParams;
    return ["checkin", "check_in", "checkout", "check_out", "guests", "bed_setup", "bed"].some(key => p.has(key))
      ? fromUrl(root.location.href) : clean(Object.assign(saved, fromUrl(root.location.href)));
  }
  function save(value) {
    const result = clean(value);
    try { root.sessionStorage.setItem(KEY, JSON.stringify(result)); } catch (_) { /* Links still work without storage. */ }
    return result;
  }
  function bookingHref(category) {
    const state = read();
    if (Object.hasOwn(categories, String(category || ""))) state.category = category;
    const url = new URL("book.html", root.location.href);
    const keys = { checkIn: "checkin", checkOut: "checkout", guests: "guests", bedSetup: "bed_setup", category: "category" };
    Object.entries(state).forEach(([key, value]) => { if (keys[key]) url.searchParams.set(keys[key], value); });
    return url.pathname.split("/").pop() + url.search;
  }
  function matches(product, category) {
    if (!Object.hasOwn(categories, String(category || "")) || !product) return false;
    if (product.kind === "combination") return (product.rooms || []).some(room => matches(room, category));
    return String(product.roomTypeId || product.room_type_id || "") === category || String(product.productId || product.sellable_product_id || "").split("_")[0] === category;
  }
  // Horizontal touch/pen swipes leave vertical scrolling and pinch zoom to the browser.
  function bindSwipe(element, step) {
    if (!element) return;
    let start = null;
    element.addEventListener("pointerdown", event => {
      if (event.isPrimary === false) { start = null; return; }
      start = event.pointerType !== "mouse" && !event.target.closest("button, a")
        ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    }, { passive: true });
    element.addEventListener("pointerup", event => {
      const previous = start; start = null;
      if (!previous || previous.id !== event.pointerId) return;
      const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      if (Math.abs(dx) >= 45 && Math.abs(dy) < Math.abs(dx) * 0.6) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    element.addEventListener("pointercancel", () => { start = null; }, { passive: true });
  }
  root.RozaStayContext = Object.freeze({ categories, clean, fromUrl, read, save, bookingHref, matches, bindSwipe });
})(window);
