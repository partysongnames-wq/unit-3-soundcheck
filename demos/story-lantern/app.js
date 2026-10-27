/* Story Lantern — teacher-operated vocabulary game. No network, no storage. */
(function () {
  "use strict";
  var WORDS = window.SL_WORDS, CH = window.SL_CHALLENGES, STORIES = window.SL_STORIES;
  var ROUNDS = ["start", "discover", "apply", "create", "recap"];
  var $ = function (id) { return document.getElementById(id); };
  var S, timerHandle = null;

  function freshState() {
    return {
      round: "start",
      order: WORDS.map(function (_, i) { return i; }),
      selected: WORDS.map(function () { return true; }),
      deck: null,            // word indices used in Discover/Apply (set on start/retry)
      dIdx: 0, dState: {},   // per word: {hint, letters, word, example}
      aIdx: 0, aState: {},   // per challenge: {picked: [], shown}
      cIdx: 0, cModel: false,
      simple: false,
      teams: 4, scores: [0, 0, 0, 0], history: [],
      retry: WORDS.map(function () { return false; }),
      timer: { minutes: 18, left: 18 * 60, running: false, expired: false, endAt: 0 }
    };
  }

  // keep the newest revealed text on screen (sticky control bar sits at the bottom)
  function reveal(el) { if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "auto" }); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function deck() {
    return S.deck || S.order.filter(function (i) { return S.selected[i]; });
  }
  function applyList() {
    var list = [];
    deck().forEach(function (wi) {
      CH.forEach(function (c, ci) { if (c.word === WORDS[wi].word) list.push(ci); });
    });
    return list;
  }

  /* ---------- Rounds ---------- */
  function go(round) {
    if (ROUNDS.indexOf(round) < 0) return;
    if (round !== "start" && !S.deck) {
      if (!deck().length) { S.selected = S.selected.map(function () { return true; }); }
      S.deck = deck();
    }
    S.round = round;
    ROUNDS.forEach(function (r) {
      $("round-" + r).hidden = r !== round;
      var b = document.querySelector('[data-round="' + r + '"]');
      if (r === round) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    render();
    $("main").focus({ preventScroll: true });
  }

  /* ---------- Start ---------- */
  function renderStart() {
    var ul = $("wordPick");
    ul.innerHTML = S.order.map(function (i) {
      return '<li><label><input type="checkbox" data-w="' + i + '"' + (S.selected[i] ? " checked" : "") + "> " + esc(WORDS[i].word) + "</label></li>";
    }).join("");
    var d = S.order.filter(function (i) { return S.selected[i]; });
    $("selCount").textContent = "(" + d.length + " of " + WORDS.length + ")";
    $("orderText").textContent = d.length ? "Order: " + d.map(function (i) { return WORDS[i].word; }).join(", ") : "No words selected.";
    $("startWarn").hidden = true;
  }

  /* ---------- Discover ---------- */
  function dCur() { var d = deck(); return d.length ? d[Math.min(S.dIdx, d.length - 1)] : null; }
  function dSt(wi) { return S.dState[wi] || (S.dState[wi] = { hint: false, letters: 0, word: false, example: false }); }
  function renderDiscover() {
    var d = deck(), wi = dCur();
    if (wi === null) return;
    var w = WORDS[wi], st = dSt(wi);
    $("dProgress").textContent = "Word " + (S.dIdx + 1) + " of " + d.length;
    $("dPic").innerHTML = w.svg;
    $("dClue").textContent = w.clue;
    $("dHint").hidden = !st.hint;
    $("dHint").innerHTML = st.hint ? "<b>Hint:</b> " + esc(w.hint) + (S.simple ? "<br><b>Simple:</b> it means “" + esc(w.simple) + "”." : "") : "";
    var showAll = st.word;
    $("dLetters").innerHTML = w.word.split("").map(function (ch, k) {
      var on = showAll || k < st.letters;
      return '<span class="' + (on ? "on" : "") + '">' + (on ? esc(ch) : "") + "</span>";
    }).join("");
    $("dLetters").setAttribute("aria-label", w.word.length + " letters" + (st.letters && !showAll ? ", " + st.letters + " shown" : ""));
    var r = $("dReveal");
    r.hidden = !st.word;
    if (st.word) {
      var h = '<p class="wordline">' + esc(w.word) + ' <span class="pos">(' + esc(w.pos) + ')</span></p><p class="def">' + esc(w.def) + "</p>";
      if (st.example) {
        h += '<p class="ex">“' + esc(w.example) + '”</p><div class="talk"><b>Talk with your partner:</b> ' + esc(w.speak) + "</div>";
        if (S.simple) h += '<p class="starter"><b>Sentence starter:</b> ' + esc(w.starter) + "</p>";
        h += '<p class="challenge"><b>Challenge:</b> ' + esc(w.challenge) + "</p>";
      }
      r.innerHTML = h;
      reveal(r.lastElementChild);
    } else r.innerHTML = "";
    $("dPrev").disabled = S.dIdx === 0;
    $("dNext").textContent = S.dIdx >= d.length - 1 ? "Go to Apply →" : "Next →";
    $("dLetterBtn").disabled = st.word || st.letters >= w.word.length;
    $("dWordBtn").disabled = st.word;
    $("dHintBtn").disabled = st.hint;
    $("dExBtn").disabled = st.example;
  }
  function dAct(kind) {
    var wi = dCur(); if (wi === null) return;
    var st = dSt(wi), w = WORDS[wi];
    if (kind === "hint") st.hint = true;
    else if (kind === "letter") { st.letters = Math.min(w.word.length, st.letters + 1); if (st.letters === w.word.length) st.word = true; }
    else if (kind === "word") st.word = true;
    else if (kind === "example") { st.word = true; st.example = true; }
    else if (kind === "hide") S.dState[wi] = { hint: false, letters: 0, word: false, example: false };
    else if (kind === "step") {   // Space: hint → first letter → whole word → example + talk
      if (!st.hint) st.hint = true;
      else if (!st.word && st.letters === 0) st.letters = 1;
      else if (!st.word) st.word = true;
      else if (!st.example) st.example = true;
      else { dMove(1); return; }
    }
    renderDiscover();
  }
  function dMove(n) {
    var len = deck().length, ni = S.dIdx + n;
    if (ni < 0) return;
    if (ni >= len) { go("apply"); return; }
    S.dIdx = ni; renderDiscover();
  }

  /* ---------- Apply ---------- */
  function aSt(ci) { return S.aState[ci] || (S.aState[ci] = { picked: [], shown: false }); }
  function renderApply() {
    var list = applyList();
    if (!list.length) return;
    S.aIdx = Math.min(S.aIdx, list.length - 1);
    var ci = list[S.aIdx], c = CH[ci], st = aSt(ci);
    $("aProgress").textContent = "Question " + (S.aIdx + 1) + " of " + list.length;
    $("aTag").textContent = "Target word: " + c.word;
    $("aQ").textContent = c.q;
    $("aOpts").innerHTML = c.opts.map(function (o, k) {
      var cls = "";
      if (st.shown && k === c.ok) cls = "right";
      else if (st.picked.indexOf(k) >= 0) cls = k === c.ok ? "right" : "wrong";
      return '<button data-opt="' + k + '" class="' + cls + '"><span class="letter">' + "ABC"[k] + "</span> " + esc(o) + "</button>";
    }).join("");
    var fb = st.picked.map(function (k) {
      return '<p class="' + (k === c.ok ? "fb-ok" : "fb-bad") + '"><b>' + "ABC"[k] + ":</b> " + esc(c.why[k]) + "</p>";
    });
    if (st.shown && st.picked.indexOf(c.ok) < 0) fb.push('<p class="fb-ok"><b>Answer ' + "ABC"[c.ok] + ":</b> " + esc(c.why[c.ok]) + "</p>");
    if (st.picked.length && st.picked.indexOf(c.ok) < 0 && !st.shown) fb.push('<p class="muted">Try again, or press Space to show the answer.</p>');
    $("aFb").innerHTML = fb.join("");
    reveal($("aFb").lastElementChild);
    $("aPrev").disabled = S.aIdx === 0;
    $("aNext").textContent = S.aIdx >= list.length - 1 ? "Go to Create →" : "Next →";
    $("aShow").disabled = st.shown || st.picked.indexOf(c.ok) >= 0;
  }
  function aPick(k) {
    var list = applyList(); if (!list.length) return;
    var ci = list[S.aIdx], st = aSt(ci);
    if (k >= CH[ci].opts.length) return;
    if (st.picked.indexOf(k) < 0) st.picked.push(k);
    renderApply();
  }
  function aShow() { var list = applyList(); if (!list.length) return; aSt(list[S.aIdx]).shown = true; renderApply(); }
  function aMove(n) {
    var len = applyList().length, ni = S.aIdx + n;
    if (ni < 0) return;
    if (ni >= len) { go("create"); return; }
    S.aIdx = ni; renderApply();
  }

  /* ---------- Create ---------- */
  function renderCreate() {
    var s = STORIES[S.cIdx];
    $("cProgress").textContent = "Word set " + (S.cIdx + 1) + " of " + STORIES.length;
    $("cWords").innerHTML = s.words.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("");
    $("cModel").hidden = !S.cModel;
    $("cModel").innerHTML = S.cModel ? "<b>Model story:</b> " + esc(s.model) : "";
    $("cModelBtn").textContent = S.cModel ? "Hide model story" : "Show model story";
  }
  function cMove(n) { S.cIdx = (S.cIdx + n + STORIES.length) % STORIES.length; S.cModel = false; renderCreate(); }

  /* ---------- Recap ---------- */
  function renderRecap() {
    $("recapBody").innerHTML = WORDS.map(function (w, i) {
      return '<tr><td><input type="checkbox" aria-label="Retry ' + esc(w.word) + '" data-r="' + i + '"' + (S.retry[i] ? " checked" : "") + "></td><td>" +
        esc(w.word) + ' <span class="pos muted small">' + esc(w.pos) + "</span></td><td>" + esc(w.def) + "</td></tr>";
    }).join("");
    $("retryWarn").hidden = true;
  }
  function retry(round) {
    var list = S.order.filter(function (i) { return S.retry[i]; });
    if (!list.length) { $("retryWarn").hidden = false; return; }
    S.deck = list;
    list.forEach(function (i) {
      delete S.dState[i];
      CH.forEach(function (c, ci) { if (c.word === WORDS[i].word) delete S.aState[ci]; });
    });
    S.dIdx = 0; S.aIdx = 0;
    S.retry = WORDS.map(function () { return false; });
    go(round);
  }

  /* ---------- Scores ---------- */
  function renderScores() {
    $("scores").hidden = !S.showScores;
    $("scoreToggle").setAttribute("aria-pressed", S.showScores ? "true" : "false");
    $("teamCount").value = S.teams;
    $("teamList").innerHTML = S.scores.map(function (p, t) {
      return '<li><span>Team ' + (t + 1) + '</span><button data-t="' + t + '" data-d="-1" aria-label="Team ' + (t + 1) + ' minus one">−1</button><span class="pts" data-pts="' + t + '">' + p + '</span><button data-t="' + t + '" data-d="1" aria-label="Team ' + (t + 1) + ' plus one">+1</button></li>';
    }).join("");
    $("scoreUndo").disabled = !S.history.length;
  }
  function score(t, d) { S.scores[t] += d; S.history.push([t, d]); renderScores(); }
  function setTeams(n) {
    n = Math.max(2, Math.min(8, parseInt(n, 10) || 4));
    S.teams = n;
    S.scores = Array.from({ length: n }, function (_, i) { return S.scores[i] || 0; });
    S.history = S.history.filter(function (h) { return h[0] < n; });
    renderScores();
  }

  /* ---------- Timer ---------- */
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function renderTimer() {
    var t = S.timer;
    $("timerDisplay").textContent = fmt(t.left);
    $("timerToggle").textContent = t.running ? "Pause" : (t.expired ? "Start" : (t.left < t.minutes * 60 ? "Resume" : "Start"));
    $("timer").classList.toggle("expired", t.expired);
    $("timerMinutes").value = t.minutes;
  }
  function tick() {
    var t = S.timer;
    t.left = Math.max(0, (t.endAt - Date.now()) / 1000);
    if (t.left <= 0) { t.running = false; t.expired = true; clearInterval(timerHandle); timerHandle = null; toast("Time's up!"); }
    renderTimer();
  }
  function timerToggle() {
    var t = S.timer;
    if (t.running) { t.left = Math.max(0, (t.endAt - Date.now()) / 1000); t.running = false; clearInterval(timerHandle); timerHandle = null; }
    else {
      if (t.expired || t.left <= 0) { t.left = t.minutes * 60; t.expired = false; }
      t.running = true; t.endAt = Date.now() + t.left * 1000;
      timerHandle = setInterval(tick, 250);
    }
    renderTimer();
  }
  function timerReset() {
    var t = S.timer; clearInterval(timerHandle); timerHandle = null;
    t.running = false; t.expired = false; t.left = t.minutes * 60; renderTimer();
  }

  /* ---------- Global ---------- */
  function render() {
    document.body.classList.toggle("simple", S.simple);
    $("simpleToggle").setAttribute("aria-pressed", S.simple ? "true" : "false");
    if (S.round === "start") renderStart();
    if (S.round === "discover") renderDiscover();
    if (S.round === "apply") renderApply();
    if (S.round === "create") renderCreate();
    if (S.round === "recap") renderRecap();
    renderScores(); renderTimer();
  }
  function resetAll() {
    clearInterval(timerHandle); timerHandle = null;
    S = freshState(); S.showScores = false;
    $("help").hidden = true;
    go("start");
    toast("Everything has been reset.");
  }
  function fullscreen() {
    var d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) throw new Error("none");
      var p = req.call(el);
      if (p && p.catch) p.catch(function () { toast("Fullscreen was blocked. Press F11 (Windows) or Ctrl+Cmd+F (Mac)."); });
    } catch (e) { toast("Fullscreen is not available. Press F11 (Windows) or Ctrl+Cmd+F (Mac)."); }
  }
  function help(open) {
    $("help").hidden = !open;
    if (open) $("helpClose").focus(); else $("helpBtn").focus();
  }

  function isTyping(el) {
    if (!el) return false;
    var tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;
    var k = e.key, lower = k.length === 1 ? k.toLowerCase() : k;
    if (!$("help").hidden) {
      if (k === "Escape" || k === "?") { e.preventDefault(); help(false); }
      return;  // other shortcuts paused while help is open
    }
    var map = { q: "start", d: "discover", a: "apply", c: "create", r: "recap" };
    var handled = true;
    if (k === "?") help(true);
    else if (map[lower]) go(map[lower]);
    else if (lower === "t") timerToggle();
    else if (lower === "f") fullscreen();
    else if (lower === "b") { S.showScores = !S.showScores; renderScores(); }
    else if (k === "ArrowRight" || k === "PageDown") {
      if (S.round === "discover") dMove(1); else if (S.round === "apply") aMove(1); else if (S.round === "create") cMove(1); else handled = false;
    } else if (k === "ArrowLeft" || k === "PageUp") {
      if (S.round === "discover") dMove(-1); else if (S.round === "apply") aMove(-1); else if (S.round === "create") cMove(-1); else handled = false;
    } else if (k === " ") {
      if (S.round === "discover") dAct("step"); else if (S.round === "apply") aShow(); else handled = false;
    } else if (S.round === "discover" && { h: 1, l: 1, w: 1, e: 1 }[lower]) {
      dAct({ h: "hint", l: "letter", w: "word", e: "example" }[lower]);
    } else if (S.round === "apply" && /^[1-3]$/.test(k)) aPick(+k - 1);
    else handled = false;
    if (handled) e.preventDefault();
  });

  function on(id, fn) { $(id).addEventListener("click", fn); }
  document.querySelectorAll("[data-round]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.round); }); });
  $("wordPick").addEventListener("change", function (e) {
    var i = +e.target.dataset.w; S.selected[i] = e.target.checked; S.deck = null; S.dIdx = 0; S.aIdx = 0; renderStart();
  });
  on("selAll", function () { S.selected = S.selected.map(function () { return true; }); S.deck = null; renderStart(); });
  on("selNone", function () { S.selected = S.selected.map(function () { return false; }); S.deck = null; renderStart(); });
  on("shuffleBtn", function () {
    var a = S.order.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    S.order = a; S.deck = null; S.dIdx = 0; S.aIdx = 0; renderStart();
  });
  on("orderReset", function () { S.order = WORDS.map(function (_, i) { return i; }); S.deck = null; renderStart(); });
  on("startBtn", function () {
    var d = S.order.filter(function (i) { return S.selected[i]; });
    if (!d.length) { $("startWarn").hidden = false; return; }
    S.deck = d; S.dIdx = 0; S.aIdx = 0; S.dState = {}; S.aState = {};
    go("discover");
  });
  $("timerMinutes").addEventListener("change", function (e) {
    var m = Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 18));
    S.timer.minutes = m; if (!S.timer.running) { S.timer.left = m * 60; S.timer.expired = false; }
    renderTimer();
  });
  on("timerToggle", timerToggle);
  on("timerReset", timerReset);
  on("scoreToggle", function () { S.showScores = !S.showScores; renderScores(); });
  on("simpleToggle", function () { S.simple = !S.simple; render(); });
  on("fsBtn", fullscreen);
  on("helpBtn", function () { help(true); });
  on("helpClose", function () { help(false); });
  $("help").addEventListener("click", function (e) { if (e.target === $("help")) help(false); });
  on("dPrev", function () { dMove(-1); });
  on("dNext", function () { dMove(1); });
  on("dHintBtn", function () { dAct("hint"); });
  on("dLetterBtn", function () { dAct("letter"); });
  on("dWordBtn", function () { dAct("word"); });
  on("dExBtn", function () { dAct("example"); });
  on("dHide", function () { dAct("hide"); });
  $("aOpts").addEventListener("click", function (e) { var b = e.target.closest("[data-opt]"); if (b) aPick(+b.dataset.opt); });
  on("aShow", aShow);
  on("aPrev", function () { aMove(-1); });
  on("aNext", function () { aMove(1); });
  on("cPrev", function () { cMove(-1); });
  on("cNext", function () { cMove(1); });
  on("cModelBtn", function () { S.cModel = !S.cModel; renderCreate(); });
  $("recapBody").addEventListener("change", function (e) { S.retry[+e.target.dataset.r] = e.target.checked; });
  on("retryDiscover", function () { retry("discover"); });
  on("retryApply", function () { retry("apply"); });
  on("resetAll", resetAll);
  $("teamList").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (b) score(+b.dataset.t, +b.dataset.d); });
  $("teamCount").addEventListener("change", function (e) { setTeams(e.target.value); });
  on("scoreUndo", function () { var h = S.history.pop(); if (h) S.scores[h[0]] -= h[1]; renderScores(); });
  on("scoreReset", function () { S.scores = S.scores.map(function () { return 0; }); S.history = []; renderScores(); });

  S = freshState(); S.showScores = false;
  go("start");
  window.__SL = { state: function () { return S; } }; // read-only hook for tests
})();
