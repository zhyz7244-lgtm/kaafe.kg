(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const KEY = "kaafi_cart_v1";

  // ---------- состояние корзины: { id: {qty, name, volume, price} } ----------
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cart = {}; }

  // Актуализируем цены/названия по тому, что сейчас на странице; убираем исчезнувшие товары.
  const cards = {};
  $$(".card[data-id]").forEach((c) => (cards[c.dataset.id] = c));
  Object.keys(cart).forEach((id) => {
    const c = cards[id];
    if (!c || c.classList.contains("soldout")) { delete cart[id]; return; }
    cart[id].price = +c.dataset.price;
    cart[id].name = c.dataset.name;
    cart[id].volume = c.dataset.volume;
  });

  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };
  const fmt = (n) => n + " сом";

  // ---------- карточки: степпер + «В заказ» ----------
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest(".card");
    if (!card) return;
    const qtyEl = $("[data-qty]", card);
    let q = +qtyEl.textContent;
    if (btn.dataset.act === "minus") qtyEl.textContent = Math.max(1, q - 1);
    if (btn.dataset.act === "plus") qtyEl.textContent = Math.min(50, q + 1);
    if (btn.dataset.act === "add") {
      const id = card.dataset.id;
      const cur = cart[id] ? cart[id].qty : 0;
      cart[id] = {
        qty: Math.min(50, cur + q),
        name: card.dataset.name,
        volume: card.dataset.volume,
        price: +card.dataset.price,
      };
      qtyEl.textContent = 1;
      card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
      save(); render();
    }
  });

  // ---------- отрисовка корзины ----------
  const itemsEl = $("#cart-items"), emptyEl = $("#cart-empty"), footEl = $("#cart-foot");
  function render() {
    itemsEl.textContent = "";
    let total = 0, count = 0;
    Object.entries(cart).forEach(([id, it]) => {
      total += it.price * it.qty; count += it.qty;
      const row = document.createElement("div"); row.className = "ci";
      const info = document.createElement("div");
      const n = document.createElement("div"); n.className = "ci-name"; n.textContent = it.name;
      const s = document.createElement("div"); s.className = "ci-sub";
      s.textContent = [it.volume, fmt(it.price)].filter(Boolean).join(" · ");
      info.append(n, s);
      const st = document.createElement("div"); st.className = "stepper";
      const mk = (t, d) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t;
        b.addEventListener("click", () => change(id, d)); return b; };
      const q = document.createElement("span"); q.textContent = it.qty;
      st.append(mk("−", -1), q, mk("+", 1));
      row.append(info, st);
      itemsEl.append(row);
    });
    const has = count > 0;
    emptyEl.hidden = has; footEl.hidden = !has;
    $("#total").textContent = fmt(total);
    $("#fab-count").textContent = count;
    $("#fab-total").textContent = fmt(total);
    $("#cart-fab").hidden = !has || $("#cart").classList.contains("open");
  }
  function change(id, d) {
    cart[id].qty += d;
    if (cart[id].qty <= 0) delete cart[id];
    else cart[id].qty = Math.min(50, cart[id].qty);
    save(); render();
  }

  // ---------- мобильная корзина / меню ----------
  const cartEl = $("#cart"), scrim = $("#scrim"), sidebar = $("#sidebar");
  function openCart(v) { cartEl.classList.toggle("open", v); scrim.hidden = !v && !sidebar.classList.contains("open"); render(); }
  $("#cart-fab").addEventListener("click", () => { openCart(true); scrim.hidden = false; });
  $("#cart-close").addEventListener("click", () => openCart(false));
  $("#burger").addEventListener("click", () => { sidebar.classList.add("open"); scrim.hidden = false; });
  scrim.addEventListener("click", () => { cartEl.classList.remove("open"); sidebar.classList.remove("open"); scrim.hidden = true; render(); });
  $$(".nav a").forEach((a) => a.addEventListener("click", () => { sidebar.classList.remove("open"); scrim.hidden = true; }));

  // ---------- фильтр по категориям и поиск ----------
  let cat = "all";
  function applyFilter() {
    const q = $("#search").value.trim().toLowerCase();
    let any = false;
    $$(".cat").forEach((sec) => {
      const catOk = cat === "all" || sec.dataset.cat === cat;
      let vis = 0;
      $$(".card", sec).forEach((c) => {
        const ok = catOk && (!q || c.dataset.search.includes(q));
        c.hidden = !ok; if (ok) vis++;
      });
      sec.hidden = vis === 0; if (vis) any = true;
    });
    $("#nothing").hidden = any;
  }
  $$(".pill").forEach((p) => p.addEventListener("click", () => {
    $$(".pill").forEach((x) => x.classList.remove("active")); p.classList.add("active");
    cat = p.dataset.cat; applyFilter();
    const first = document.querySelector(".cat:not([hidden])");
    if (first && window.scrollY > 200) first.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("#search").addEventListener("input", applyFilter);

  // ---------- оформление заказа ----------
  const errEl = $("#order-error"), placeBtn = $("#place-order");
  const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || ($("input[name=csrfmiddlewaretoken]") || {}).value || "";
  placeBtn.addEventListener("click", async () => {
    errEl.hidden = true;
    const table = $("#table-number").value;
    if (!table) { errEl.textContent = "Выберите номер вашего стола."; errEl.hidden = false; return; }
    placeBtn.disabled = true; placeBtn.textContent = "Отправляем…";
    try {
      const res = await fetch(window.ORDER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
        body: JSON.stringify({
          table_number: table,
          comment: $("#comment").value,
          items: Object.entries(cart).map(([id, it]) => ({ id: +id, qty: it.qty })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось отправить заказ. Попробуйте ещё раз.");
      cart = {}; save(); $("#comment").value = "";
      $("#done-text").textContent = "Заказ №" + data.order_id + " для стола " + data.table + " на сумму " + fmt(data.total) + " передан на кухню." + (data.bonus ? " После выдачи вам начислится " + data.bonus + " бонусов." : "");
      track(data.order_id);
      $("#done").hidden = false; $(".cart-table").hidden = true; itemsEl.hidden = true; emptyEl.hidden = true; footEl.hidden = true;
      $("#cart-fab").hidden = true;
    } catch (err) {
      errEl.textContent = err.message; errEl.hidden = false;
    } finally {
      placeBtn.disabled = false; placeBtn.textContent = "Оформить заказ";
    }
  });
  $("#done-close").addEventListener("click", () => {
    clearInterval(trackTimer); $("#track").hidden = true;
    $("#done").hidden = true; $(".cart-table").hidden = false; itemsEl.hidden = false; render();
    openCart(false);
  });

  // ---------- отзывы ----------
  const form = $("#review-form");
  $("#open-review").addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) form.scrollIntoView({ behavior: "smooth", block: "center" }); });
  const ratingInput = $("input[name=rating]", form);
  const reviewError = $("#review-error");
  function showReviewError(msg) { reviewError.textContent = msg; reviewError.hidden = false; }
  function paintStars(v) {
    $$("#rate button").forEach((b) => { const on = +b.dataset.v <= v; b.classList.toggle("on", on); b.textContent = on ? "★" : "☆"; });
  }
  $$("#rate button").forEach((b) => b.addEventListener("click", () => { ratingInput.value = b.dataset.v; paintStars(+b.dataset.v); reviewError.hidden = true; }));
  paintStars(+ratingInput.value || 0);
  const fileInput = $("input[type=file]", form), fileLabel = $("#file-label");
  fileInput.addEventListener("change", () => {
    const n = fileInput.files.length;
    fileLabel.textContent = n === 0 ? "Прикрепить фото" : n === 1 ? fileInput.files[0].name : "Выбрано фото: " + n;
    fileInput.closest(".file-btn").classList.toggle("has-files", n > 0);
  });
  form.addEventListener("submit", (e) => {
    const files = fileInput.files;
    if (!ratingInput.value) { e.preventDefault(); showReviewError("Поставьте оценку звёздами."); const r = $("#rate"); r.classList.remove("shake"); void r.offsetWidth; r.classList.add("shake"); return; }
    if (!$("textarea", form).value.trim() && !files.length) { e.preventDefault(); showReviewError("Напишите отзыв или приложите фото."); return; }
    if (files.length > 4) { e.preventDefault(); showReviewError("Можно приложить не больше 4 фото."); return; }
    for (const f of files) if (f.size > 5 * 1024 * 1024) { e.preventDefault(); showReviewError("Фото «" + f.name + "» больше 5 МБ."); return; }
  });

  // ---------- статус заказа для гостя ----------
  let trackTimer = null;
  const STEP = { new: 1, in_progress: 2, done: 3 };
  const TXT = {
    new: ["Принят", "Мы получили заказ — скоро начнём готовить."],
    in_progress: ["Готовится", "Бариста уже над вашим заказом."],
    done: ["Готово!", "Заказ выдан. Приятного аппетита!"],
    cancelled: ["Отменён", "Заказ отменён. Если это ошибка — подойдите к бару."],
  };
  function track(id) {
    clearInterval(trackTimer);
    const box = $("#track");
    box.hidden = false;
    const url = "/order/" + id + "/status/";
    async function tick() {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        const t = TXT[d.status] || [d.label, ""];
        $("#track-title").textContent = t[0];
        $("#track-sub").textContent = t[1];
        const n = STEP[d.status] || 0;
        $$(".steps i", box).forEach((el, i) => el.classList.toggle("on", i < n));
        box.classList.toggle("ready", d.status === "done");
        if (d.status === "done" || d.status === "cancelled") clearInterval(trackTimer);
      } catch (e) {}
    }
    tick();
    trackTimer = setInterval(tick, 5000);
  }

  // ---------- закреплённые категории ----------
  const pw = $("#pills-wrap");
  if (pw) {
    const sentinel = document.createElement("div");
    pw.before(sentinel);
    new IntersectionObserver(([e]) => pw.classList.toggle("stuck", !e.isIntersecting)).observe(sentinel);
  }

  render();
})();
