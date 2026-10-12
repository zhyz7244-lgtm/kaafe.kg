(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = "kaafi_books_cart_v1";
  const fmt = (n) => n.toLocaleString("ru-RU") + " сом";

  // ---------- состояние корзины: { id: {qty, title, price, photo} } ----------
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cart = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };

  // Актуализируем цены/названия по тому, что сейчас на странице.
  $$(".book-add[data-id]").forEach((b) => {
    const it = cart[b.dataset.id];
    if (it) { it.price = +b.dataset.price; it.title = b.dataset.title; it.photo = b.dataset.photo; }
  });

  // ---------- добавление ----------
  document.addEventListener("click", (e) => {
    const dq = e.target.closest("[data-dq]");
    if (dq) {
      const el = $("#dq");
      el.textContent = Math.max(1, Math.min(20, +el.textContent + +dq.dataset.dq));
      return;
    }
    const btn = e.target.closest(".book-add");
    if (!btn) return;
    const id = btn.dataset.id;
    const qtyEl = btn.dataset.qtyFrom ? $(btn.dataset.qtyFrom) : null;
    const add = qtyEl ? +qtyEl.textContent : 1;
    const cur = cart[id] ? cart[id].qty : 0;
    cart[id] = { qty: Math.min(20, cur + add), title: btn.dataset.title, price: +btn.dataset.price, photo: btn.dataset.photo || "" };
    save(); render();
    const old = btn.textContent;
    btn.textContent = "Добавлено ✓"; btn.classList.add("added");
    setTimeout(() => { btn.textContent = old; btn.classList.remove("added"); }, 1100);
  });

  // ---------- отрисовка корзины ----------
  const itemsEl = $("#cart-items"), emptyEl = $("#cart-empty"), form = $("#checkout");
  function render() {
    itemsEl.textContent = "";
    let total = 0, count = 0;
    Object.entries(cart).forEach(([id, it]) => {
      total += it.price * it.qty; count += it.qty;
      const row = document.createElement("div"); row.className = "ci";
      if (it.photo) { const im = document.createElement("img"); im.src = it.photo; im.alt = ""; im.className = "ci-img"; row.append(im); }
      const info = document.createElement("div"); info.style.flex = "1"; info.style.minWidth = "0";
      const n = document.createElement("div"); n.className = "ci-name"; n.textContent = it.title;
      const s = document.createElement("div"); s.className = "ci-sub"; s.textContent = fmt(it.price) + " × " + it.qty + " = " + fmt(it.price * it.qty);
      info.append(n, s);
      const st = document.createElement("div"); st.className = "stepper";
      const mk = (t, d) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.setAttribute("aria-label", d > 0 ? "Больше" : "Меньше"); b.addEventListener("click", () => change(id, d)); return b; };
      const q = document.createElement("span"); q.textContent = it.qty;
      st.append(mk("−", -1), q, mk("+", 1));
      row.append(info, st);
      itemsEl.append(row);
    });
    const has = count > 0;
    emptyEl.hidden = has; form.hidden = !has;
    $("#total").textContent = fmt(total);
    $("#fab-count").textContent = count;
    $("#fab-total").textContent = fmt(total);
    $("#cart-fab").hidden = !has || $("#cart").classList.contains("open");
  }
  function change(id, d) {
    cart[id].qty += d;
    if (cart[id].qty <= 0) delete cart[id];
    else cart[id].qty = Math.min(20, cart[id].qty);
    save(); render();
  }

  // ---------- мобильная корзина и меню ----------
  const cartEl = $("#cart"), scrim = $("#scrim"), sidebar = $("#sidebar");
  function openCart(v) { cartEl.classList.toggle("open", v); scrim.hidden = !v && !sidebar.classList.contains("open"); render(); }
  $("#cart-fab").addEventListener("click", () => { openCart(true); scrim.hidden = false; });
  $("#cart-close").addEventListener("click", () => openCart(false));
  $("#burger").addEventListener("click", () => { sidebar.classList.add("open"); scrim.hidden = false; });
  scrim.addEventListener("click", () => { cartEl.classList.remove("open"); sidebar.classList.remove("open"); scrim.hidden = true; render(); });

  // ---------- закреплённые жанры ----------
  const pw = $("#pills-wrap");
  if (pw && "IntersectionObserver" in window) {
    const sentinel = document.createElement("div");
    pw.before(sentinel);
    new IntersectionObserver(([e]) => pw.classList.toggle("stuck", !e.isIntersecting)).observe(sentinel);
    const active = $(".pill.active", pw);
    if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
  }

  // ---------- способ получения ----------
  const addr = $("#addr-fields"), pickupNote = $("#pickup-note"), deliveryNote = $("#delivery-note");
  function method() { return form.delivery_method.value; }
  function syncMethod() {
    const pickup = method() === "pickup";
    addr.hidden = pickup; pickupNote.hidden = !pickup; deliveryNote.hidden = pickup;
  }
  $$("input[name=delivery_method]", form).forEach((r) => r.addEventListener("change", syncMethod));
  syncMethod();

  // Подставляем данные зарегистрированного клиента или то, что гость вводил раньше.
  const PROFILE_KEY = "kaafi_books_profile_v1";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) {}
  ["name", "phone", "country", "city", "address"].forEach((f) => { if (saved[f]) form[f].value = saved[f]; });
  if (window.CUSTOMER) {
    if (!form.name.value) form.name.value = window.CUSTOMER.name;
    if (!form.phone.value) form.phone.value = "+" + window.CUSTOMER.phone;
  }

  // ---------- оформление ----------
  const errEl = $("#order-error"), placeBtn = $("#place-order");
  const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
  const fail = (msg) => { errEl.textContent = msg; errEl.hidden = false; };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const f = Object.fromEntries(new FormData(form).entries());
    if (!f.name.trim()) return fail("Укажите ваше имя.");
    if (f.phone.replace(/\D/g, "").length < 9) return fail("Укажите номер телефона.");
    if (f.delivery_method === "delivery" && !(f.country.trim() && f.city.trim() && f.address.trim()))
      return fail("Для доставки укажите страну, город и адрес.");
    placeBtn.disabled = true; placeBtn.textContent = "Отправляем…";
    try {
      const res = await fetch(window.BOOK_ORDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
        body: JSON.stringify({ ...f, items: Object.entries(cart).map(([id, it]) => ({ id: +id, qty: it.qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        (data.gone || []).forEach((id) => delete cart[id]);
        if (data.gone) { save(); render(); }
        throw new Error(data.error || "Не удалось отправить заказ. Попробуйте ещё раз.");
      }
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: f.name, phone: f.phone, country: f.country, city: f.city, address: f.address })); } catch (e2) {}
      cart = {}; save();
      $("#done-text").textContent = "Заказ №" + data.order_id + " на сумму " + fmt(data.total) + ". " +
        (data.delivery === "pickup" ? "Мы позвоним, когда книги будут готовы к выдаче." : "Менеджер свяжется с вами, чтобы подтвердить доставку.");
      $("#done").hidden = false; itemsEl.hidden = true; emptyEl.hidden = true; form.hidden = true; $("#cart-fab").hidden = true;
      if (window.innerWidth <= 1180) openCart(true);
    } catch (err) {
      fail(err.message);
    } finally {
      placeBtn.disabled = false; placeBtn.textContent = "Оформить заказ";
    }
  });
  $("#done-close").addEventListener("click", () => {
    $("#done").hidden = true; itemsEl.hidden = false; render(); openCart(false);
  });

  render();
})();
