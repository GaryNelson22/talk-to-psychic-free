(function () {
  "use strict";
  var T = window.TAROT_TOOL;
  if (!T) return;
  var cfg = T.cfg, cards = T.cards, POS = T.positions;
  var N = cards.length, PICKS = 6;
  var bySlug = {};
  cards.forEach(function (c) { bySlug[c.slug] = c; });
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ratio = cfg.ratio || 1.5;

  var $ = function (id) { return document.getElementById(id); };
  var table = $("tt-table"), bubble = $("tt-bubble"), counter = $("tt-count");
  var btnShuffle = $("tt-shuffle"), btnDeal = $("tt-deal"), btnReveal = $("tt-reveal");
  var spread = $("tt-spread"), result = $("tt-result"), qbox = $("tt-q"), qinput = $("tt-qinput");
  var root = document.documentElement;

  var order = cards.map(function (c) { return c.slug; });
  var els = {};
  var mode = "stack", stage = "intro", busy = false, picked = [];
  var geo = { cw: 90 };

    function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? Math.min(ms, 30) : ms); }); }
  function rnd(n) {
    if (window.crypto && crypto.getRandomValues) {
      var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n, x;
      do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sentences(t) {
    t = (t || "").replace(/\s+/g, " ").trim();
    return t.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) || [];
  }
  function words(s) { return s.trim().split(/\s+/).length; }
    function take(t, minW, maxW) {
    var s = sentences(t), out = [], n = 0;
    for (var i = 0; i < s.length; i++) {
      var w = words(s[i]);
      if (n && n + w > maxW) break;
      out.push(s[i].trim());
      n += w;
      if (n >= minW) break;
    }
    return out.join(" ");
  }
  function kwList(list, n) { return (list || []).slice(0, n).join(", "); }

    function readingFor(c, pos) {
    var nm = c.name, p1, p2;
    switch (pos) {
      case 0:
        p1 = "In the place that shows how you see yourself right now, you drew " + nm + ". " + take(c.summary, 24, 40);
        p2 = take(c.upright[0], 32, 52);
        break;
      case 1:
        p1 = "Under the practical goals, " + nm + " points to what you truly want. " + take(c.love, 26, 44);
        p2 = take(c.advice, 28, 48);
        break;
      case 2:
        p1 = nm + " sits in the position of fear, so it is the shadow side of the card that matters here. " + take(c.reversed[0], 26, 44);
        p2 = take(c.reversed[1] || c.reversed[0], 28, 48);
        break;
      case 3:
        p1 = "In your favour you have " + nm + ", a real ally in this situation. " + take(c.upright[0], 28, 46);
        p2 = take(c.upright[1] || c.money, 28, 48);
        break;
      case 4:
        p1 = "Standing in your way is " + nm + ", and the obstacle may be an attitude as much as an event. " + take(c.career, 22, 40);
        p2 = take(c.reversed[0], 28, 48);
        break;
      default:
        p1 = "Where this is heading: " + nm + " shows the direction of travel if you keep on as you are. " + take(c.advice, 24, 42);
        var yn = c.yes_no || {};
        p2 = "If you are asking a yes-or-no question, the lean is " + (yn.answer || "Maybe") + ". " + take(yn.why || "", 22, 42);
    }
    return [p1.trim(), p2.trim()];
  }

  function imgFor(c, cls) {
    var wrap = h("span", "tt-front");
    if (cfg.art.cards[c.slug]) {
      var im = document.createElement("img");
      im.src = "cards/" + c.slug + ".webp";
      im.alt = c.name + " tarot card";
      im.width = cfg.w; im.height = cfg.h;
      im.loading = "lazy"; im.decoding = "async";
      wrap.appendChild(im);
    } else {
      var ph = h("span", "tt-ph");
      ph.appendChild(h("span", "gl", "✦"));
      ph.appendChild(h("span", "num", c.number));
      wrap.appendChild(ph);
      wrap.appendChild(h("span", "tt-nm", c.name));
    }
    if (cls) wrap.className += " " + cls;
    return wrap;
  }

    function say(text, title) {
    bubble.textContent = "";
    bubble.appendChild(h("b", null, title || cfg.guide));
    bubble.appendChild(h("p", null, text));
    bubble.classList.remove("is-new");
    void bubble.offsetWidth;
    bubble.classList.add("is-new");
  }

    function place(el, x, y, r, z) {
    el.style.setProperty("--x", x.toFixed(1) + "px");
    el.style.setProperty("--y", y.toFixed(1) + "px");
    el.style.setProperty("--r", (r || 0).toFixed(2) + "deg");
    el.style.zIndex = z;
  }
  function layout(m, opts) {
    opts = opts || {};
    mode = m;
    table.setAttribute("data-mode", m);
    var W = table.clientWidth || 320, i, el, slug;
    var small = W < 560;
    if (m === "stack") {
      var cw = Math.min(small ? 96 : 118, W * 0.3), ch = cw * ratio, pad = 14, thick = 0.55;
      geo.cw = cw;
      table.style.setProperty("--cw", cw + "px");
      var cx = (W - cw) / 2 - (N * thick) / 2;
      for (i = 0; i < N; i++) {
        slug = order[i]; el = els[slug];
        var d = N - 1 - i;
        place(el, cx + d * thick, pad + d * thick, 0, i + 1);
        el.classList.remove("is-picked");
      }
      table.style.setProperty("--th", (ch + pad * 2 + N * thick) + "px");
    } else {
      var rows = small ? 2 : 1, per = Math.ceil(N / rows);
      var cw2 = small ? Math.min(78, W / (1 + (per - 1) * 0.42)) : Math.min(108, W / (1 + (per - 1) * 0.3));
      var ch2 = cw2 * ratio, step = (W - cw2) / (per - 1), lift = 26, gap = 14;
      geo.cw = cw2;
      table.style.setProperty("--cw", cw2 + "px");
      for (i = 0; i < N; i++) {
        slug = order[i]; el = els[slug];
        var row = Math.floor(i / per), col = i % per, t = per > 1 ? (col - (per - 1) / 2) / ((per - 1) / 2) : 0;
        var y = lift + row * (ch2 + gap) + (rows === 1 ? -10 * (1 - t * t) + 10 : 0);
        place(el, col * step, y, rows === 1 ? t * 3 : 0, i + 1);
        el.style.transitionDelay = (opts.stagger && !reduce) ? (i * 22) + "ms" : "0ms";
      }
      table.style.setProperty("--th", (lift + rows * (ch2 + gap) + 14) + "px");
    }
    updateCardA11y();
  }
  function updateCardA11y() {
    order.forEach(function (slug, i) {
      var el = els[slug], top = i === N - 1;
      if (mode === "stack") {
        el.tabIndex = top ? 0 : -1;
        el.setAttribute("aria-hidden", top ? "false" : "true");
        el.setAttribute("aria-label", "Deck of 22 face-down cards. Activate to deal the cards.");
        el.removeAttribute("aria-pressed");
      } else {
        el.tabIndex = 0;
        el.setAttribute("aria-hidden", "false");
        el.setAttribute("aria-label", "Card " + (i + 1) + " of " + N + ", face down");
        el.setAttribute("aria-pressed", el.classList.contains("is-picked") ? "true" : "false");
      }
    });
  }

  function buildDeck() {
    table.textContent = "";
    cards.forEach(function (c) {
      var b = h("button", "tt-card");
      b.type = "button";
      b.setAttribute("data-slug", c.slug);
      var inn = h("span", "tt-card-in");
      inn.appendChild(h("span", "tt-back"));
      b.appendChild(inn);
      b.appendChild(h("span", "tt-pickno"));
      b.addEventListener("click", function () { onCard(c.slug); });
      table.appendChild(b);
      els[c.slug] = b;
    });
  }

    function setCount() {
    var left = PICKS - picked.length;
    if (stage !== "pick") { counter.textContent = ""; return; }
    counter.textContent = left > 0
      ? "Choose " + left + " more card" + (left === 1 ? "" : "s")
      : "All six chosen. Ready when you are.";
    btnReveal.hidden = left > 0;
  }
  function renumber() {
    order.forEach(function (slug) {
      var el = els[slug], k = picked.indexOf(slug);
      el.classList.toggle("is-picked", k >= 0);
      el.querySelector(".tt-pickno").textContent = k >= 0 ? String(k + 1) : "";
      if (mode === "fan") el.setAttribute("aria-pressed", k >= 0 ? "true" : "false");
    });
    setCount();
  }

  function gather() {
    picked = [];
    renumber();
    layout("stack");
    return wait(650);
  }

  async function doShuffle() {
    if (busy || stage === "reveal" || stage === "result") return;
    busy = true;
    btnShuffle.disabled = btnDeal.disabled = true;
    btnReveal.hidden = true;
    say("Shuffling. Keep your question in mind and let the cards mix.");
    if (mode !== "stack") { stage = "intro"; await gather(); }
    var rounds = reduce ? 1 : 3;
    for (var r = 0; r < rounds; r++) {
      var shift = geo.cw * 0.9;
      order.forEach(function (slug, i) {
        var left = i % 2 === 0, el = els[slug], base = el.style;
        place(el, parseFloat(base.getPropertyValue("--x")) + (left ? -shift : shift), parseFloat(base.getPropertyValue("--y")), left ? -7 : 7, i + 1);
      });
      await wait(420);
      order = shuffled(order);
      layout("stack");
      await wait(520);
    }
    stage = "shuffled";
    busy = false;
    btnShuffle.disabled = btnDeal.disabled = false;
    btnShuffle.textContent = "Shuffle again";
    say("The deck feels ready. Press “Deal cards” (or tap the deck) to spread them out.");
  }

  async function doDeal() {
    if (busy || mode === "fan" || stage === "reveal" || stage === "result") return;
    busy = true;
    btnDeal.disabled = true;
    layout("fan", { stagger: true });
    stage = "pick";
    await wait(900);
    order.forEach(function (s) { els[s].style.transitionDelay = "0ms"; });
    busy = false;
    btnDeal.hidden = true;
    btnShuffle.textContent = "Gather and shuffle";
    btnShuffle.disabled = false;
    say("Let your hand choose, not your head. Tap six cards that call to you. Tap a chosen card again to put it back.");
    setCount();
    var first = els[order[0]];
    if (first && first.focus && document.activeElement === btnDeal) first.focus({ preventScroll: true });
  }

  function onCard(slug) {
    if (busy) return;
    if (mode === "stack") { doDeal(); return; }
    if (stage !== "pick") return;
    var k = picked.indexOf(slug);
    if (k >= 0) {
      picked.splice(k, 1);
      say("Card returned. Choose " + (PICKS - picked.length) + " more.");
    } else if (picked.length >= PICKS) {
      say("That is already six. Tap one of your chosen cards to put it back if you want to swap.");
      return;
    } else {
      picked.push(slug);
      say(picked.length < PICKS ? "Good. " + (PICKS - picked.length) + " more to go." : "That is six. Press “Reveal my reading” when you are ready.");
    }
    renumber();
  }

  async function doReveal() {
    if (busy || picked.length !== PICKS) return;
    busy = true; stage = "reveal";
    btnReveal.hidden = true; btnShuffle.hidden = true; counter.textContent = "";
    qbox.hidden = true;
    say("Turning your cards over, one by one. Take them in slowly.");
    table.classList.add("is-gone");
    spread.textContent = "";
    picked.forEach(function (slug, i) {
      var c = bySlug[slug];
      var li = h("li", "tt-slot");
      li.style.setProperty("--i", i);
      li.appendChild(h("span", "tt-slotno", String(i + 1)));
      li.appendChild(h("div", "tt-slottitle", POS[i].title));
      var b = h("button", "tt-flip");
      b.type = "button";
      b.disabled = true;
      b.setAttribute("aria-label", "Position " + (i + 1) + ", " + POS[i].title + ", face down");
      var inn = h("span", "tt-flip-in");
      inn.appendChild(h("span", "tt-back"));
      inn.appendChild(imgFor(c));
      b.appendChild(inn);
      b.addEventListener("click", function () { openCard(c, b); });
      li.appendChild(b);
      li.appendChild(h("div", "tt-cardname", c.name));
      spread.appendChild(li);
    });
    spread.hidden = false;
    var slots = spread.children;
    setTimeout(function () { spread.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }, 80);
    await wait(900);
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.add("is-flipped");
      var fb = slots[i].querySelector(".tt-flip");
      fb.disabled = false; fb.classList.add("can-open");
      fb.setAttribute("aria-label", POS[i].title + ": " + bySlug[picked[i]].name + ". Open full card meaning.");
      await wait(650);
    }
    await wait(700);
    buildResult();
    stage = "result"; busy = false;
    say("That is your spread. Tap any card for its full meaning, or read on below.");
  }

  function buildResult() {
    result.textContent = "";
    result.appendChild(h("h2", null, "Your six-card reading"));
    var q = (qinput.value || "").trim();
    if (q) {
      var qe = h("p", "tt-qecho");
      qe.appendChild(h("b", null, "Your question: "));
      qe.appendChild(document.createTextNode("“" + q + "”"));
      result.appendChild(qe);
    }
    result.appendChild(h("p", "tt-note", "Read each position as a prompt for reflection, not a prediction. For entertainment and self-reflection."));
    picked.forEach(function (slug, i) {
      var c = bySlug[slug], paras = readingFor(c, i);
      var art = h("article", "tt-read");
      var th = h("button", "thumb");
      th.type = "button";
      th.setAttribute("aria-label", "Open full meaning of " + c.name);
      th.appendChild(imgFor(c));
      th.addEventListener("click", function () { openCard(c, th); });
      var body = h("div");
      body.appendChild(h("span", "tt-read-pos", "Position " + (i + 1) + " · " + POS[i].title));
      body.appendChild(h("h3", null, c.name));
      body.appendChild(h("p", "tt-kw", kwList(c.keywords_upright, 4)));
      body.appendChild(h("p", null, paras[0]));
      body.appendChild(h("p", null, paras[1]));
      var more = h("button", "tt-link", "Read the full meaning of " + c.name);
      more.type = "button";
      more.addEventListener("click", function () { openCard(c, more); });
      body.appendChild(more);
      art.appendChild(th); art.appendChild(body);
      result.appendChild(art);
    });
    var fin = h("div", "tt-final");
    fin.appendChild(h("h3", null, "Want to go deeper than the cards?"));
    var ids = picked.map(function (s) { return bySlug[s].name; });
    fin.appendChild(h("p", null, "Your spread holds " + ids[0] + ", " + ids[1] + " and " + ids[5] + " among others. A live psychic can connect them to your real situation and answer follow-up questions."));
    var ctl = h("div", "tt-controls");
    var cta;
    if (cfg.sitePopup) {
      cta = h("a", "tt-btn cta", cfg.ctaLabel);
      cta.href = cfg.ctaHref;
      cta.rel = "nofollow sponsored";
    } else {
      cta = h("button", "tt-btn cta", cfg.ctaLabel);
      cta.type = "button";
      cta.setAttribute("data-tt-cta", "1");
    }
    ctl.appendChild(cta);
    var again = h("button", "tt-btn ghost", "New reading");
    again.type = "button";
    again.addEventListener("click", resetAll);
    ctl.appendChild(again);
    fin.appendChild(ctl);
    result.appendChild(fin);
    result.hidden = false;
  }

  async function resetAll() {
    if (busy) return;
    busy = true;
    result.hidden = true; result.textContent = "";
    spread.hidden = true; spread.textContent = "";
    picked = []; stage = "intro";
    order = cards.map(function (c) { return c.slug; });
    qbox.hidden = false;
    btnShuffle.hidden = false; btnShuffle.disabled = false; btnShuffle.textContent = "Shuffle";
    btnDeal.hidden = false; btnDeal.disabled = false; btnReveal.hidden = true;
    table.classList.remove("is-gone");
    buildDeck();
    layout("stack");
    counter.textContent = "";
    busy = false;
    say(greeting());
    $("tt-tool").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  function greeting() {
    return "Hi, I am " + cfg.guide + ". Take a breath and think of a question, or simply stay open. When you are ready, press “Shuffle”.";
  }

    var active = null, prevFocus = null;
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll('a[href],button:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])'), function (n) { return !n.hidden; });
  }
  function closeDlg() {
    if (!active) return;
    var d = active; active = null;
    document.body.classList.remove("tt-scroll-lock");
    if (d.open) d.close();
    d.remove();
    if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    prevFocus = null;
  }
  function makeDlg(labelId) {
    var d = h("dialog", "tt-dlg");
    d.setAttribute("aria-labelledby", labelId);
    var p = h("section", "tt-dlg-p");
    var x = h("button", "tt-x", "×");
    x.type = "button"; x.setAttribute("aria-label", "Close");
    x.addEventListener("click", closeDlg);
    p.appendChild(x);
    d.appendChild(p);
    d.addEventListener("cancel", function (e) { e.preventDefault(); closeDlg(); });
    d.addEventListener("click", function (e) { if (e.target === d) closeDlg(); });
    d.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = focusables(d);
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    return { d: d, p: p };
  }
  function showDlg(m, trigger) {
    if (active) return;
    prevFocus = trigger;
    document.body.appendChild(m.d);
    active = m.d;
    document.body.classList.add("tt-scroll-lock");
    m.d.showModal();
    var f = focusables(m.p).filter(function (n) { return !n.classList.contains("tt-x"); })[0] || m.p.querySelector(".tt-x");
    if (f) requestAnimationFrame(function () { f.focus(); });
  }
  function sect(parent, title, paras) {
    if (!paras || (Array.isArray(paras) && !paras.length)) return;
    parent.appendChild(h("h3", null, title));
    (Array.isArray(paras) ? paras : [paras]).forEach(function (t) { parent.appendChild(h("p", null, t)); });
  }
  function openCard(c, trigger) {
    if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) return;
    var m = makeDlg("tt-md-title");
    var wrap = h("div", "tt-md");
    wrap.appendChild(imgFor(c));
    var tx = h("div");
    tx.appendChild(h("p", "tt-eyebrow", "Major Arcana · " + c.number));
    var t = h("h2", null, c.name); t.id = "tt-md-title";
    tx.appendChild(t);
    tx.appendChild(h("p", "tt-md-meta", "Element: " + c.element + " · Planet or sign: " + c.astrology));
    tx.appendChild(h("p", "tt-kw", "Upright: " + kwList(c.keywords_upright, 5) + ". Reversed: " + kwList(c.keywords_reversed, 5) + "."));
    tx.appendChild(h("p", null, c.summary));
    sect(tx, "Upright meaning", c.upright);
    sect(tx, "Reversed meaning", c.reversed);
    sect(tx, "In love", c.love);
    sect(tx, "At work", c.career);
    sect(tx, "Money", c.money);
    sect(tx, "Advice", c.advice);
    if (c.yes_no) sect(tx, "Yes or no: " + c.yes_no.answer, c.yes_no.why);
    wrap.appendChild(tx);
    m.p.appendChild(wrap);
    showDlg(m, trigger);
  }

  var CHIPS = ["Love and relationships", "Career and money", "Life path and purpose"];
  function openCta(trigger) {
    if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) {
      window.location.assign(cfg.ctaHref);
      return;
    }
    var m = makeDlg("tt-cta-title");
    var body = h("div");
    var names = picked.length === PICKS ? picked.map(function (s) { return bySlug[s].name; }) : null;
    m.p.appendChild(h("p", "tt-eyebrow", "Your cards are only the start"));
    var title = h("h2", null, "Want a real psychic to go deeper?"); title.id = "tt-cta-title";
    m.p.appendChild(title);
    m.p.appendChild(h("p", "intro", names
      ? "Your spread shows " + names[0] + ", " + names[1] + " and " + names[5] + ". A live psychic can read how they fit your real situation and answer what the cards leave open."
      : "Cards give you a starting point. A live psychic can read how it fits your real situation and answer what the cards leave open."));
    m.p.appendChild(body);
    function step1() {
      body.textContent = "";
      body.appendChild(h("p", "tt-prog", "Question 1 of 1"));
      body.appendChild(h("h3", "tt-qq", "What would you like to explore?"));
      var box = h("div", "tt-chips");
      box.setAttribute("role", "group");
      CHIPS.forEach(function (label) {
        var b = h("button", "tt-chip", label);
        b.type = "button";
        b.addEventListener("click", function () { step2(label); });
        box.appendChild(b);
      });
      body.appendChild(box);
    }
    function step2(label) {
      body.textContent = "";
      body.appendChild(h("p", "tt-prog", "Complete"));
      body.appendChild(h("div", "tt-mark", "✦"));
      body.appendChild(h("h3", "tt-qq", "Your focus: " + label));
      body.appendChild(h("p", "intro", "Continue when you feel ready. Your own judgment stays at the center of every decision."));
      var a = h("a", "tt-go", "Continue to your reading");
      a.href = cfg.ctaHref;
      a.rel = "nofollow sponsored";
      a.setAttribute("data-nebula-cta", "1");
      a.setAttribute("data-nebula-preserve", "1");
      a.setAttribute("data-nebula-quiz-final", "1");
      body.appendChild(a);
      requestAnimationFrame(function () { a.focus(); });
    }
    step1();
    showDlg(m, trigger);
  }

    document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-tt-cta]") : null;
    if (t) { e.preventDefault(); openCta(t); }
  });
  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (stage === "reveal" || stage === "result") return;
      layout(mode);
    }, 120);
  });
  btnShuffle.addEventListener("click", doShuffle);
  btnDeal.addEventListener("click", doDeal);
  btnReveal.addEventListener("click", doReveal);

  if (cfg.art.back) root.classList.add("has-back");
  buildDeck();
  layout("stack");
  say(greeting());

  window.__tarot = { readingFor: readingFor, take: take, sentences: sentences, shuffled: shuffled, state: function () { return { stage: stage, mode: mode, picked: picked.slice() }; } };
})();
