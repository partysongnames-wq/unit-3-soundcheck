/* Story Lantern v2 — teacher-run projector game. No network, no storage, no student data. */
(function () {
  "use strict";
  var W = window.SL_WORDS, CH = window.SL_CHALLENGES, ST = window.SL_STORIES, TW = window.SL_TWISTS, LINES = window.SL_LINES;
  var $ = function (id) { return document.getElementById(id); };
  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var reduced = function () { return reduceMQ.matches; };
  var TEAM_NAMES = ["Neon", "Static", "Eclipse", "Riot"];
  var RULES = { act: 1, whisper: 1, sentence: 1 };

  function fresh(teams) {
    return {
      round: "start",
      order: W.map(function (_, i) { return i; }),
      selected: W.map(function () { return true; }),
      deck: [], pos: 0, rv: {},
      apply: { list: [], pos: 0, picks: {} },
      create: { pos: 0, model: false },
      recap: { ticks: {}, unlocked: false },
      teams: teams || TEAM_NAMES.map(function (n) { return { name: n, score: 0 }; }),
      undo: [], effect: null, sinceTwist: 0, twist: null,
      settings: { lessonMin: 18, lanternSec: 45, lanternOn: true, twistEvery: 2, simple: false, sound: false }
    };
  }
  var state = fresh();
  var lesson = { left: 18 * 60, running: false, endAt: 0, done: false };
  var cd = { word: -1, total: 45, left: 45, endAt: 0, st: "idle", warned: false };
  var sentence = { left: 0, endAt: 0, running: false };
  var lastKey = "", pendingDraw = false;

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  var toastT;
  function toast(msg) { var t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
  function rv(i) { return state.rv[i] || (state.rv[i] = { stage: 0, hint: false, letters: 0 }); }
  function buildDeck() { state.deck = state.order.filter(function (i) { return state.selected[i]; }); state.pos = 0; }
  function curWord() { return state.deck[state.pos]; }

  /* ---------------- host ---------------- */
  var lastLine = "", moodT;
  function say(cat, vars, mood) {
    var opts = (LINES[cat] || [""]).filter(function (l) { return l !== lastLine; });
    var line = pick(opts.length ? opts : LINES[cat]);
    if (vars) Object.keys(vars).forEach(function (k) { line = line.split("{" + k + "}").join(vars[k]); });
    lastLine = line;
    var el = $("hostLine"), host = $("host");
    el.textContent = line;
    el.classList.remove("new"); void el.offsetWidth; el.classList.add("new");
    host.className = "talk mood-" + (mood || "idle");
    clearTimeout(moodT);
    moodT = setTimeout(function () { host.className = "mood-idle"; }, 2600);
  }

  /* ---------------- sound (synth only, off by default) ---------------- */
  var actx = null;
  function sfx(type) {
    if (!state.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var notes = { reveal: [523, 659, 784, 1047], right: [660, 990], wrong: [140, 110], tick: [880], twist: [220, 330, 440, 660], score: [740, 988], out: [98], swap: [300, 200, 300] }[type] || [440];
      notes.forEach(function (f, n) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + n * 0.09;
        o.type = type === "wrong" || type === "out" ? "sawtooth" : "triangle";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + (type === "tick" ? 0.08 : 0.28));
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.32);
      });
    } catch (e) { /* audio unavailable: stay silent */ }
  }
  function setSound(on) {
    state.settings.sound = !!on;
    $("soundOn").checked = !!on;
    var b = $("soundBtn"); b.textContent = on ? "🔊" : "🔇"; b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", on ? "Sound on" : "Sound off");
    toast(on ? "Sound on (synth effects)" : "Sound off");
    if (on) sfx("tick");
  }

  /* ---------------- effects ---------------- */
  function burst(el, colors) {
    if (reduced() || !el) return;
    var r = el.getBoundingClientRect(), fx = $("fx");
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var fl = document.createElement("div"); fl.className = "flash"; fl.style.setProperty("--x", x + "px"); fl.style.setProperty("--y", y + "px"); fx.appendChild(fl);
    colors = colors || ["#ffb547", "#3de0ff", "#ff3d8b", "#c6ff3d", "#fff3c4"];
    for (var n = 0; n < 28; n++) {
      var s = document.createElement("i"); s.className = "spark";
      var a = Math.random() * Math.PI * 2, d = 80 + Math.random() * Math.max(120, r.width * 0.45);
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(a) * d + "px"); s.style.setProperty("--dy", Math.sin(a) * d * 0.7 + "px");
      s.style.setProperty("--c", colors[n % colors.length]);
      fx.appendChild(s);
    }
    setTimeout(function () { fx.innerHTML = ""; }, 1000);
  }
  function drawArt(box, instant) {
    var svg = box.querySelector("svg"); if (!svg) return;
    var els = Array.prototype.slice.call(svg.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect"));
    if (instant || reduced()) { finishArt(box); return; }
    var total = 7, n = els.length;
    box.style.setProperty("--td", total + "s");
    els.forEach(function (el, i) {
      var delay = (i / n) * total * 0.85, dur = Math.max(0.5, (total / n) * 2.2);
      if (el.classList.contains("dash")) { el.style.opacity = "0"; el.style.transition = "opacity .5s ease " + delay + "s"; return; }
      var len = 600; try { len = el.getTotalLength() || 600; } catch (e) { /* keep default */ }
      el.style.strokeDasharray = len; el.style.strokeDashoffset = len;
      el.style.transition = "stroke-dashoffset " + dur.toFixed(2) + "s ease-in-out " + delay.toFixed(2) + "s";
    });
    svg.getBoundingClientRect();
    els.forEach(function (el) { if (el.classList.contains("dash")) el.style.opacity = "1"; else el.style.strokeDashoffset = "0"; });
    box.classList.add("drawn");
  }
  function finishArt(box) {
    if (!box) return;
    box.style.setProperty("--td", "0s");
    box.querySelectorAll("svg *").forEach(function (el) { el.style.transition = "none"; el.style.strokeDashoffset = "0"; el.style.opacity = ""; });
    box.classList.add("drawn");
  }

  /* ---------------- teams / tower ---------------- */
  function snapshot() { state.undo.push({ s: state.teams.map(function (t) { return t.score; }), e: state.effect }); if (state.undo.length > 100) state.undo.shift(); }
  function award(t, n) {
    if (t < 0 || t > 3) return;
    snapshot();
    var team = state.teams[t], gain = n || 1, note = "";
    if (state.effect && state.effect.id === "double" && gain > 0) { gain *= 2; state.effect = null; note = "×2!"; }
    team.score += gain;
    if (state.effect && state.effect.id === "steal") {
      var victim = -1;
      state.teams.forEach(function (o, k) { if (k !== t && o.score > 0 && (victim < 0 || o.score > state.teams[victim].score)) victim = k; });
      if (victim >= 0) { state.teams[victim].score -= 1; team.score += 1; note = "stole 1 from " + state.teams[victim].name; }
      state.effect = null;
    }
    renderTower(t, "+" + (gain + (note.indexOf("stole") === 0 ? 1 : 0)));
    renderBadge();
    if (note) toast(team.name + " " + note);
    say("score", { team: team.name }, "smug");
    sfx("score");
  }
  function minus(t) {
    if (state.teams[t].score <= 0) return;
    snapshot(); state.teams[t].score -= 1; renderTower(t, "−1");
  }
  function undo() {
    var u = state.undo.pop(); if (!u) { toast("Nothing to undo"); return; }
    state.teams.forEach(function (t, k) { t.score = u.s[k]; }); state.effect = u.e;
    renderTower(); renderBadge(); toast("Undone");
  }
  function resetScores() {
    if (state.teams.every(function (t) { return t.score === 0; })) return;
    snapshot(); state.teams.forEach(function (t) { t.score = 0; }); renderTower(); toast("Scores reset (Undo brings them back)");
  }
  function buildTower() {
    var lanes = $("lanes"); lanes.innerHTML = "";
    state.teams.forEach(function (t, k) {
      var lane = document.createElement("div"); lane.className = "lane"; lane.style.setProperty("--tc", "var(--t" + k + ")");
      lane.innerHTML = '<div class="score" id="sc' + k + '">0</div><div class="track"><button class="climber" id="cl' + k + '" aria-label="Point to team ' + (k + 1) + '">' +
        '<svg viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1 v5" stroke="#8a6a3a" stroke-width="2"/><rect x="7" y="6" width="20" height="30" rx="5" fill="rgba(255,255,255,.05)" style="stroke:var(--tc)" stroke-width="2"/><ellipse class="lglow" cx="17" cy="23" rx="5" ry="8"/><rect x="5" y="36" width="24" height="5" rx="2" fill="#3a2f1c"/></svg></button></div>' +
        '<div class="name" id="nm' + k + '"></div><div class="pm"><button class="minus" data-k="' + k + '" aria-label="Minus one">−</button><button class="plus" data-k="' + k + '" aria-label="Plus one">+</button></div>';
      lanes.appendChild(lane);
    });
    lanes.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("climber")) award(+b.id.slice(2));
      else if (b.classList.contains("plus")) award(+b.dataset.k);
      else if (b.classList.contains("minus")) minus(+b.dataset.k);
    });
  }
  function renderTower(popK, popText) {
    var max = Math.max.apply(null, state.teams.map(function (t) { return t.score; }));
    var goal = Math.max(10, max + 3);
    state.teams.forEach(function (t, k) {
      $("sc" + k).textContent = t.score;
      $("nm" + k).textContent = t.name;
      var cl = $("cl" + k), track = cl.parentNode;
      var h = Math.max(0, track.clientHeight - 52) * (Math.max(0, t.score) / goal);
      cl.style.setProperty("--h", h.toFixed(1));
      cl.classList.toggle("leader", max > 0 && t.score === max);
      if (popK === k && popText) {
        var p = document.createElement("span"); p.className = "pop"; p.textContent = popText; p.style.bottom = (h + 48) + "px";
        track.appendChild(p); setTimeout(function () { p.remove(); }, 950);
      }
    });
    $("undoBtn").disabled = !state.undo.length;
  }

  /* ---------------- plot twists ---------------- */
  function drawTwist(notId) {
    var pool = TW.filter(function (c) { return c.id !== notId; });
    var sum = pool.reduce(function (a, c) { return a + c.weight; }, 0), r = Math.random() * sum;
    for (var i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r < 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function showTwist(card) {
    state.twist = card;
    $("twistIcon").textContent = card.icon; $("twistTitle").textContent = card.title; $("twistBody").textContent = card.body;
    $("twistGo").textContent = card.id === "swap" ? "Swap now (Space)" : "Accept (Space)";
    var c = $("twistCard"); c.classList.remove("shown", "shuffle");
    $("twist").hidden = false;
    if (reduced()) c.classList.add("shown");
    else { void c.offsetWidth; c.classList.add("shuffle"); setTimeout(function () { c.classList.add("shown"); }, 420); }
    say("twist", null, "shock"); sfx("twist");
  }
  function openTwist() { cdPause(true); showTwist(drawTwist()); }
  function closeTwist() {
    $("twist").hidden = true; state.twist = null; renderBadge();
    if (pendingDraw) { pendingDraw = false; drawArt(document.querySelector(".art"), false); }
    maybeStartCountdown();
  }
  function twistAccept() {
    var c = state.twist; if (!c) return;
    if (c.id === "swap") {
      var hi = 0, lo = 0;
      state.teams.forEach(function (t, k) { if (t.score > state.teams[hi].score) hi = k; if (t.score < state.teams[lo].score) lo = k; });
      snapshot();
      var tmp = state.teams[hi].score; state.teams[hi].score = state.teams[lo].score; state.teams[lo].score = tmp;
      renderTower(); say("swap", null, "smug"); sfx("swap");
      toast(state.teams[hi].name + " ⇄ " + state.teams[lo].name);
    } else {
      state.effect = { id: c.id, title: c.title, body: c.body, pos: state.round === "discover" ? state.pos : -1 };
    }
    closeTwist();
  }
  function twistRedraw() { if (state.twist) showTwist(drawTwist(state.twist.id)); }
  function twistSkip() { closeTwist(); toast("Twist skipped"); }
  function renderBadge() {
    var b = $("twistBadge"), e = state.effect;
    if (!e) { b.hidden = true; b.innerHTML = ""; return; }
    b.hidden = false;
    var short = { double: "Next point counts double", steal: "Next scorer steals 1 from the leader", act: "This word: act it out, no words", whisper: "This word: whisper chain", sentence: "After the reveal: sentence in 10 s" }[e.id];
    b.innerHTML = "<b>" + esc(e.title) + "</b>" + esc(short) + (e.id === "sentence" ? '<br><button id="sentBtn">' + (sentence.running ? mmss(sentence.left) : "Start 10 s") + "</button>" : "") + ' <br><button id="effClear">Clear</button>';
  }

  /* ---------------- countdown lantern (per word) ---------------- */
  function maybeStartCountdown() {
    if (state.round !== "discover" || !$("twist").hidden) return;
    var i = curWord(); if (i === undefined) return;
    if (rv(i).stage === 0 && cd.word !== i) cdStart(i);
    else if (cd.st === "held") { cd.st = "run"; cd.endAt = Date.now() + cd.left * 1000; }
    updateCountdown();
  }
  function cdStart(i) {
    cd.word = i; cd.total = state.settings.lanternSec; cd.left = cd.total; cd.warned = false;
    if (!state.settings.lanternOn) { cd.st = "off"; return; }
    cd.st = "run"; cd.endAt = Date.now() + cd.left * 1000;
  }
  function cdPause(hold) {
    if (cd.st === "run") { cd.left = (cd.endAt - Date.now()) / 1000; cd.st = hold ? "held" : "pause"; }
    else if (!hold && (cd.st === "pause" || cd.st === "held")) { cd.st = "run"; cd.endAt = Date.now() + cd.left * 1000; }
    updateCountdown();
  }
  function cdStop() { if (cd.st === "run" || cd.st === "pause" || cd.st === "held") { if (cd.st === "run") cd.left = (cd.endAt - Date.now()) / 1000; cd.st = "stopped"; } updateCountdown(); }
  function cdSkip() { if (state.round !== "discover") return; cd.st = "skip"; updateCountdown(); toast("Countdown skipped for this word"); }
  function updateCountdown() {
    var el = document.querySelector(".countdown"); if (!el) return;
    var hide = cd.st === "off" || cd.st === "skip" || cd.word !== curWord();
    el.hidden = hide; if (hide) return;
    el.style.setProperty("--life", Math.max(0.12, cd.left / cd.total).toFixed(3));
    el.querySelector(".ctime").textContent = cd.st === "out" ? "OUT" : mmss(cd.left);
    el.classList.toggle("urgent", cd.st === "run" && cd.left <= 10);
    el.classList.toggle("paused", cd.st === "pause" || cd.st === "held" || cd.st === "stopped");
    el.classList.toggle("out", cd.st === "out");
    el.querySelector(".cpause").textContent = cd.st === "pause" ? "Resume (P)" : "Pause (P)";
    el.querySelector(".cpause").hidden = !(cd.st === "run" || cd.st === "pause");
  }

  /* ---------------- clock ---------------- */
  function tick() {
    var now = Date.now();
    if (lesson.running) {
      lesson.left = (lesson.endAt - now) / 1000;
      if (lesson.left <= 0) { lesson.left = 0; lesson.running = false; lesson.done = true; toast("Time's up!"); say("out", null, "shock"); sfx("out"); }
      renderLesson();
    }
    if (cd.st === "run") {
      var before = Math.ceil(cd.left);
      cd.left = (cd.endAt - now) / 1000;
      if (cd.left <= 10 && !cd.warned) { cd.warned = true; say("tense", null, "tense"); }
      if (cd.left <= 5 && Math.ceil(cd.left) !== before && cd.left > 0) sfx("tick");
      if (cd.left <= 0) { cd.left = 0; cd.st = "out"; say("out", null, "bored"); sfx("out"); }
      updateCountdown();
    }
    if (sentence.running) {
      sentence.left = (sentence.endAt - now) / 1000;
      var sb = $("sentBtn");
      if (sentence.left <= 0) { sentence.running = false; toast("10 seconds — time!"); sfx("out"); if (sb) sb.textContent = "Time!"; }
      else if (sb) sb.textContent = mmss(sentence.left);
    }
  }
  function renderLesson() {
    var b = $("lessonTimer"); b.textContent = mmss(lesson.left);
    b.classList.toggle("running", lesson.running); b.classList.toggle("done", lesson.done);
  }
  function toggleLesson() {
    if (lesson.running) { lesson.left = (lesson.endAt - Date.now()) / 1000; lesson.running = false; }
    else { if (lesson.done || lesson.left <= 0) { lesson.left = state.settings.lessonMin * 60; lesson.done = false; } lesson.running = true; lesson.endAt = Date.now() + lesson.left * 1000; }
    renderLesson();
  }
  function resetLesson() { lesson.running = false; lesson.done = false; lesson.left = state.settings.lessonMin * 60; renderLesson(); }

  /* ---------------- rounds ---------------- */
  function setRound(r, keep) {
    if (r === "discover" && !state.deck.length) buildDeck();
    if (r === "discover" && !state.deck.length) { toast("No words selected — open the teacher panel (S)"); return; }
    if (r === "apply" && !keep) {
      var words = (state.deck.length ? state.deck : state.order.filter(function (i) { return state.selected[i]; })).map(function (i) { return W[i].word; });
      if (!words.length) words = W.map(function (w) { return w.word; });
      state.apply.list = CH.map(function (_, i) { return i; }).filter(function (i) { return words.indexOf(CH[i].word) >= 0; });
      state.apply.pos = 0;
    }
    if (r !== "discover") cdStop();
    state.round = r;
    render();
    if (r !== "discover") say({ start: "start", apply: "apply", create: "create", recap: "recap" }[r], null, "idle");
    else maybeStartCountdown();
  }
  function startGame() {
    buildDeck();
    if (!state.deck.length) { toast("No words selected — open the teacher panel (S)"); return; }
    cd.word = -1;
    setRound("discover");
    say("clue", null, "idle");
  }

  /* ---------------- discover ---------------- */
  function hint() { var i = curWord(), r = rv(i); if (r.stage > 1) return; if (!r.hint) { r.hint = true; say("hint", null, "bored"); } updateClue(); }
  function letter() {
    var i = curWord(), r = rv(i); if (r.stage > 0) return;
    r.letters = Math.min(W[i].word.length, r.letters + 1);
    if (r.letters >= W[i].word.length) { reveal(); return; }
    updateClue(); say("letter", null, "smug"); sfx("tick");
  }
  function reveal() {
    var i = curWord(), r = rv(i); if (r.stage > 0) { if (r.stage > 1) { r.stage = 1; render(); } return; }
    r.stage = 1; r.letters = W[i].word.length; cdStop();
    pendingDraw = false; updateClue(); finishArt(document.querySelector(".art"));
    var tiles = document.querySelector(".tiles");
    setTimeout(function () { burst(tiles); }, reduced() ? 0 : 350);
    say("reveal", null, "shock"); sfx("reveal");
  }
  function toStage(s) {
    var i = curWord(), r = rv(i);
    if (r.stage === 0) { reveal(); if (s <= 1) return; }
    r.stage = s; render();
    say(s === 2 ? "meaning" : "talk", null, "idle");
  }
  function advance() {
    var i = curWord(), r = rv(i);
    if (r.stage === 0) { if (!r.hint) hint(); else reveal(); }
    else if (r.stage < 3) toStage(r.stage + 1);
    else nextWord();
  }
  function nextWord() {
    if (state.pos >= state.deck.length - 1) { setRound("apply"); return; }
    state.pos++;
    if (state.effect && RULES[state.effect.id] && state.effect.pos !== state.pos) state.effect = null;
    state.sinceTwist++;
    var every = +state.settings.twistEvery;
    if (every > 0 && state.sinceTwist >= every) { state.sinceTwist = 0; openTwist(); render(); }
    else { render(); say("clue", null, "idle"); maybeStartCountdown(); }
  }
  function prevWord() { if (state.pos > 0) { state.pos--; render(); maybeStartCountdown(); } }

  function tileWidth(n) {
    var st = $("stage"), avail = st.clientWidth - 70;
    return Math.max(26, Math.min(96, window.innerHeight * 0.105, Math.floor(avail / n) - 12));
  }
  function screenDiscover() {
    var i = curWord(), w = W[i], r = rv(i), key = "d" + i + "-" + (r.stage <= 1 ? "clue" : r.stage);
    var head = '<div class="kicker">Mystery word <b>' + (state.pos + 1) + "</b> / " + state.deck.length + "</div>";
    if (r.stage <= 1) {
      var tiles = "";
      for (var n = 0; n < w.word.length; n++) tiles += '<div class="tile"><div class="f">?</div><div class="b"></div></div>'; // letters enter the DOM only when flipped
      var html = '<div class="screen clue">' +
        '<div class="dhead">' + head +
        '<div class="countdown" hidden><svg viewBox="0 0 60 80" aria-hidden="true"><defs><radialGradient id="cdGlow" cx="50%" cy="65%" r="60%"><stop offset="0" stop-color="#fff2c0"/><stop offset=".5" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff4a1f"/></radialGradient></defs>' +
        '<path d="M30 2 v8" stroke="#6b5a3a" stroke-width="3"/><rect x="10" y="12" width="40" height="56" rx="9" fill="rgba(255,170,60,.08)" stroke="#8a6a3a" stroke-width="3"/>' +
        '<path class="cflame" d="M30 24 C40 38 44 50 38 58 C34 64 26 64 22 58 C16 50 20 38 30 24 Z"/><path class="smoke" d="M30 40 q-6 -8 0 -14 q6 -6 0 -14" stroke="#777" stroke-width="2" fill="none"/>' +
        '<rect x="8" y="68" width="44" height="8" rx="3" fill="#2a2011"/></svg><span class="ctime">0:45</span><button class="cbtn cpause">Pause (P)</button></div></div>' +
        '<div class="clue-body"><div class="art">' + w.svg + '</div><div><p class="clue-line" id="clueText">' + esc(w.clue) + '</p><p class="hint-line" id="hintLine" hidden>' + esc(w.hint) + "</p></div></div>" +
        '<div class="tiles" id="tiles" style="--tw:' + tileWidth(w.word.length) + 'px">' + tiles + "</div>" +
        '<p class="pos-tag" id="posTag"></p>' +
        '<div class="ctrls"><button id="bHint">Hint (H)</button><button id="bLetter">Letter (L)</button><button id="bWord" class="primary">Reveal (W)</button><span class="sep"></span><button id="bMeaning">Meaning (E)</button><button id="bPrev">← Prev</button><button id="bNext">Next →</button></div></div>';
      return { key: key, html: html, after: function (fresh) {
        if (fresh) { if ($("twist").hidden || r.stage > 0) drawArt(document.querySelector(".art"), r.stage > 0); else pendingDraw = true; }
        updateClue(); updateCountdown();
      } };
    }
    var simple = state.settings.simple;
    if (r.stage === 2) {
      return { key: key, html: '<div class="screen meaning">' + head +
        '<h2 class="big-word">' + esc(w.word) + "<small>" + esc(w.pos) + "</small></h2>" +
        '<p class="def">' + esc(w.def) + "</p>" + (simple ? '<p class="simple">Simple: ' + esc(w.simple) + "</p>" : "") +
        '<p class="example">' + esc(w.example) + "</p>" +
        '<div class="ctrls"><button id="bBack">← Clue</button><button id="bTalk" class="primary">Talk (Space)</button><button id="bNext">Next word →</button></div></div>' };
    }
    return { key: key, html: '<div class="screen meaning talk">' + '<div class="kicker">Talk · 30 seconds · <b>' + esc(w.word) + "</b></div>" +
      '<p class="talk-prompt">' + esc(w.speak) + "</p>" + (simple ? '<p class="starter">Start with: ' + esc(w.starter) + "</p>" : "") +
      '<p class="challenge">' + esc(w.challenge) + "</p>" +
      '<div class="ctrls"><button id="bBack">← Meaning</button><button id="bNext" class="primary">Next word (Space) →</button></div></div>' };
  }
  function updateClue() {
    var i = curWord(), w = W[i], r = rv(i), t = $("tiles"); if (!t) return;
    $("hintLine").hidden = !r.hint;
    var tiles = t.querySelectorAll(".tile");
    tiles.forEach(function (el, n) {
      var on = n < r.letters || r.stage > 0;
      if (on && !el.classList.contains("on")) el.style.transitionDelay = (r.stage > 0 && !reduced() ? (n * 0.07) : 0) + "s";
      el.querySelector(".b").textContent = on ? w.word[n] : "";
      el.classList.toggle("on", on);
    });
    t.classList.toggle("solved", r.stage > 0);
    $("posTag").textContent = r.stage > 0 ? w.pos : "";
    $("bHint").disabled = r.hint; $("bLetter").disabled = r.stage > 0; $("bWord").disabled = r.stage > 0;
  }

  /* ---------------- apply ---------------- */
  function ap() { var a = state.apply, qi = a.list[a.pos]; return { qi: qi, c: CH[qi], p: a.picks[qi] || (a.picks[qi] = { tried: [], solved: false }) }; }
  function screenApply() {
    var a = state.apply;
    if (!a.list.length) return { key: "a-empty", html: '<div class="screen"><p class="question">No questions for the chosen words.</p></div>' };
    var x = ap(), c = x.c;
    var q = esc(c.q).replace("___", '<span class="gap"></span>');
    var opts = c.opts.map(function (o, k) { return '<button class="opt" data-k="' + k + '"><span class="k">' + (k + 1) + "</span>" + esc(o) + "</button>"; }).join("");
    return { key: "a" + x.qi, html: '<div class="screen apply"><div class="kicker">Apply · question <b>' + (a.pos + 1) + "</b> / " + a.list.length + "</div>" +
      '<p class="question">' + q + '</p><div class="opts n' + c.opts.length + '" id="opts">' + opts + '</div><p class="why" id="why"></p>' +
      '<div class="ctrls"><button id="bPrev">← Prev</button><button id="bShow">Show answer (Space)</button><button id="bNext" class="primary">Next →</button></div></div>', after: updateApply };
  }
  function updateApply() {
    var x = ap(), why = $("why"); if (!why) return;
    document.querySelectorAll("#opts .opt").forEach(function (b, k) {
      b.classList.toggle("right", x.p.solved && k === x.c.ok);
      b.classList.toggle("wrong", x.p.tried.indexOf(k) >= 0 && k !== x.c.ok);
    });
    var last = x.p.solved ? x.c.ok : x.p.tried[x.p.tried.length - 1];
    why.textContent = last === undefined ? "" : x.c.why[last];
    why.className = "why " + (last === undefined ? "" : (last === x.c.ok ? "good" : "bad"));
  }
  function choose(k) {
    var x = ap(); if (!x.c || k >= x.c.opts.length || x.p.solved) return;
    if (k === x.c.ok) { x.p.solved = true; updateApply(); burst(document.querySelector('#opts .opt[data-k="' + k + '"]')); say("correct", null, "smug"); sfx("right"); }
    else { if (x.p.tried.indexOf(k) < 0) x.p.tried.push(k); else x.p.tried.push(x.p.tried.splice(x.p.tried.indexOf(k), 1)[0]); updateApply(); say("wrong", null, "bored"); sfx("wrong"); }
  }
  function showAnswer() { var x = ap(); if (!x.c || x.p.solved) return; x.p.solved = true; updateApply(); }
  function applyNav(d) {
    var a = state.apply;
    if (d > 0 && a.pos >= a.list.length - 1) { setRound("create"); return; }
    a.pos = Math.max(0, a.pos + d); render();
  }

  /* ---------------- create ---------------- */
  function screenCreate() {
    var c = state.create, s = ST[c.pos];
    var chips = s.words.map(function (w) { return '<span class="chip">' + esc(w) + "</span>"; }).join("");
    var body = c.model ? '<p class="model" id="model">' + esc(s.model) + "</p>" :
      '<p class="scene">' + esc(s.scene) + '</p><p class="task">In pairs: a 4-sentence story with 3–4 of these words. Funny beats perfect. 3 minutes.</p>' +
      (state.settings.simple ? '<p class="task starter">Easier: use just 2 of the words in 2 sentences.</p>' : "");
    return { key: "c" + c.pos + (c.model ? "m" : ""), html: '<div class="screen create"><div class="kicker">Create · story set <b>' + (c.pos + 1) + "</b> / " + ST.length + "</div>" +
      '<div class="chips">' + chips + "</div>" + body +
      '<div class="ctrls"><button id="bPrev">← Set</button><button id="bModel" class="primary">' + (c.model ? "Hide model (V)" : "Show model (V)") + '</button><button id="bNext">Set →</button></div></div>' };
  }
  function createNav(d) { var c = state.create; c.pos = (c.pos + d + ST.length) % ST.length; c.model = false; render(); }
  function toggleModel() { state.create.model = !state.create.model; render(); }

  /* ---------------- recap ---------------- */
  function isOpen(i) { return state.recap.unlocked || (state.rv[i] && state.rv[i].stage > 0); }
  function screenRecap() {
    var R = state.recap, any = false;
    var cards = state.order.map(function (i) {
      var w = W[i];
      if (!isOpen(i)) { any = true; return '<div class="rc locked" data-i="' + i + '"><div class="w">LOCKED</div></div>'; }
      return '<div class="rc' + (R.ticks[i] ? " tick" : "") + '" data-i="' + i + '"><label><input type="checkbox" data-i="' + i + '"' + (R.ticks[i] ? " checked" : "") + '> retry</label><div class="w">' + esc(w.word) + '</div><div class="d">' + esc(w.simple) + "</div></div>";
    }).join("");
    return { key: "r" + JSON.stringify(R) + Object.keys(state.rv).join(), html: '<div class="screen recap"><div class="kicker">Recap · tick the hard ones, then retry</div><div class="recap-grid">' + cards + "</div>" +
      '<div class="ctrls">' + (any ? '<button id="bUnlock">Reveal the rest (end of lesson)</button>' : "") +
      '<button id="bRetryD" class="primary">Retry ticked in Discover</button><button id="bRetryA">Retry ticked in Apply</button><button id="bResetAll2" class="danger">Reset everything</button></div><p class="msg" id="recapMsg" role="status"></p></div>' };
  }
  function ticked() { return state.order.filter(function (i) { return state.recap.ticks[i] && isOpen(i); }); }
  function retryDiscover() {
    var t = ticked(); if (!t.length) { $("recapMsg").textContent = "Tick at least one word first."; return; }
    state.deck = t; state.pos = 0; t.forEach(function (i) { delete state.rv[i]; }); state.recap.ticks = {}; cd.word = -1; state.sinceTwist = 0;
    setRound("discover");
  }
  function retryApply() {
    var t = ticked(); if (!t.length) { $("recapMsg").textContent = "Tick at least one word first."; return; }
    var words = t.map(function (i) { return W[i].word; });
    state.apply.list = CH.map(function (_, i) { return i; }).filter(function (i) { return words.indexOf(CH[i].word) >= 0; });
    state.apply.list.forEach(function (qi) { delete state.apply.picks[qi]; });
    state.apply.pos = 0; state.recap.ticks = {};
    setRound("apply", true);
  }
  function resetAll() {
    var names = state.teams.map(function (t) { return { name: t.name, score: 0 }; }), settings = state.settings;
    state = fresh(names); state.settings = settings; state.settings.lessonMin = +$("lessonMin").value || 18;
    cd = { word: -1, total: settings.lanternSec, left: settings.lanternSec, endAt: 0, st: "idle", warned: false };
    sentence.running = false; resetLesson(); closePanel(); renderTicks(); renderBadge(); renderTower(); setRound("start"); toast("Everything reset");
  }

  /* ---------------- start ---------------- */
  function screenStart() {
    var n = state.order.filter(function (i) { return state.selected[i]; }).length;
    var inputs = state.teams.map(function (t, k) { return '<label style="--tc:var(--t' + k + ')">Team ' + (k + 1) + '<input id="team' + k + '" maxlength="18" value="' + esc(t.name) + '" aria-label="Team ' + (k + 1) + ' name"></label>'; }).join("");
    return { key: "start" + n, html: '<div class="screen start"><h1 class="title">STORY LANTERN</h1>' +
      '<p class="tagline"><span class="n">' + n + "</span> mystery word" + (n === 1 ? "" : "s") + "</p>" +
      '<p class="sub">Four teams. One tower. Crack the clues, survive the twists, climb highest.</p>' +
      '<div class="team-setup">' + inputs + "</div>" +
      '<button class="go" id="bStart">START</button><p class="hint-gear">Teacher: press S or ⚙ for settings · ? for keys</p></div>' };
  }

  /* ---------------- render ---------------- */
  function render(force) {
    document.querySelectorAll("#rounds button").forEach(function (b) { b.setAttribute("aria-current", b.dataset.round === state.round ? "true" : "false"); });
    var s = { start: screenStart, discover: screenDiscover, apply: screenApply, create: screenCreate, recap: screenRecap }[state.round]();
    var fresh = force || s.key !== lastKey;
    if (fresh) { $("stage").innerHTML = s.html; lastKey = s.key; $("stage").scrollTop = 0; }
    if (s.after) s.after(fresh);
    renderBadge();
  }

  /* ---------------- teacher panel ---------------- */
  function renderTicks() {
    $("wordTicks").innerHTML = state.order.map(function (i, n) {
      return '<label><span class="num">' + (n + 1) + '</span><input type="checkbox" data-i="' + i + '"' + (state.selected[i] ? " checked" : "") + "> " + esc(W[i].word) + "</label>";
    }).join("");
    var c = state.selected.filter(Boolean).length;
    $("selMsg").textContent = c ? c + " of 10 words selected" : "Select at least one word.";
  }
  function selectionChanged() { state.deck = []; state.pos = 0; renderTicks(); if (state.round === "start") render(); }
  function openPanel() { renderTicks(); $("panel").hidden = false; $("panelClose").focus(); }
  function closePanel() { $("panel").hidden = true; if (document.activeElement) document.activeElement.blur(); }
  function openHelp() { $("help").hidden = false; }
  function closeHelp() { $("help").hidden = true; }
  function fullscreen() {
    var d = document;
    if (d.fullscreenElement) { d.exitFullscreen().catch(function () {}); return; }
    var req = d.documentElement.requestFullscreen;
    if (!req) { toast("Press F11 for fullscreen"); return; }
    d.documentElement.requestFullscreen().catch(function () { toast("Press F11 for fullscreen"); });
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b && e.detail > 0) b.blur(); // mouse clicks: keep Space for "next step"
    if (!b) return;
    var id = b.id;
    if (b.dataset.round) { setRound(b.dataset.round); return; }
    if (b.classList.contains("opt")) { choose(+b.dataset.k); return; }
    var map = {
      bStart: startGame, bHint: hint, bLetter: letter, bWord: reveal, bMeaning: function () { toStage(2); },
      bTalk: function () { toStage(3); }, bBack: function () { var r = rv(curWord()); r.stage = Math.max(1, r.stage - 1); render(); },
      bPrev: function () { ({ discover: prevWord, apply: function () { applyNav(-1); }, create: function () { createNav(-1); } })[state.round](); },
      bNext: function () { ({ discover: nextWord, apply: function () { applyNav(1); }, create: function () { createNav(1); } })[state.round](); },
      bShow: showAnswer, bModel: toggleModel, bUnlock: function () { state.recap.unlocked = true; render(); },
      bRetryD: retryDiscover, bRetryA: retryApply, bResetAll2: resetAll, resetAll: resetAll,
      lessonTimer: toggleLesson, soundBtn: function () { setSound(!state.settings.sound); }, fsBtn: fullscreen,
      helpBtn: openHelp, helpClose: closeHelp, gearBtn: openPanel, panelClose: closePanel,
      undoBtn: undo, resetScoresBtn: resetScores, twistGo: twistAccept, twistRedraw: twistRedraw, twistSkip: twistSkip,
      selAll: function () { state.selected = state.selected.map(function () { return true; }); selectionChanged(); },
      selNone: function () { state.selected = state.selected.map(function () { return false; }); selectionChanged(); },
      shuffleBtn: function () {
        var o = state.order.slice(), before = o.join();
        do { for (var i = o.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = o[i]; o[i] = o[j]; o[j] = t; } } while (o.join() === before);
        state.order = o; selectionChanged(); toast("Order shuffled");
      },
      azBtn: function () { state.order = W.map(function (_, i) { return i; }); selectionChanged(); },
      effClear: function () { state.effect = null; renderBadge(); },
      sentBtn: function () { sentence.running = true; sentence.left = 10; sentence.endAt = Date.now() + 10000; renderBadge(); }
    };
    if (b.classList.contains("cpause")) { cdPause(false); return; }
    if (map[id]) map[id]();
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.closest("#wordTicks")) { state.selected[+t.dataset.i] = t.checked; selectionChanged(); }
    else if (t.closest(".recap-grid")) { state.recap.ticks[+t.dataset.i] = t.checked; t.closest(".rc").classList.toggle("tick", t.checked); }
    else if (t.id === "lessonMin") { state.settings.lessonMin = Math.min(90, Math.max(1, +t.value || 18)); t.value = state.settings.lessonMin; resetLesson(); }
    else if (t.id === "lanternSec") { state.settings.lanternSec = Math.min(300, Math.max(10, +t.value || 45)); t.value = state.settings.lanternSec; }
    else if (t.id === "lanternOn") { state.settings.lanternOn = t.checked; if (!t.checked) { cd.st = "off"; updateCountdown(); } }
    else if (t.id === "twistEvery") state.settings.twistEvery = +t.value;
    else if (t.id === "simpleOn") { state.settings.simple = t.checked; render(true); }
    else if (t.id === "soundOn") setSound(t.checked);
  });
  document.addEventListener("input", function (e) {
    var m = /^team(\d)$/.exec(e.target.id || "");
    if (m) { state.teams[+m[1]].name = e.target.value.trim() || TEAM_NAMES[+m[1]]; renderTower(); }
  });

  function typing(t) { return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }
  document.addEventListener("keydown", function (e) {
    if (typing(e.target)) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
    if ((k === " " || k === "Enter") && e.target.tagName === "BUTTON") return; // let a focused button act
    if (!$("help").hidden) { if (k === "Escape" || k === "?") { closeHelp(); e.preventDefault(); } return; }
    if (!$("panel").hidden) { if (k === "Escape" || lk === "s") { closePanel(); e.preventDefault(); } return; }
    if (!$("twist").hidden) {
      if (k === " " || k === "Enter" || k === "ArrowRight") twistAccept(); else if (lk === "x") twistRedraw(); else if (k === "Escape") twistSkip(); else return;
      e.preventDefault(); return;
    }
    var digit = /^Digit([1-4])$/.exec(e.code || "") || /^([1-4])$/.exec(k);
    if (digit && e.shiftKey) { award(+digit[1] - 1); e.preventDefault(); return; }
    var R = state.round, done = true;
    if (lk === "?" ) openHelp();
    else if (lk === "s") openPanel();
    else if (lk === "f") fullscreen();
    else if (lk === "m") setSound(!state.settings.sound);
    else if (lk === "t") toggleLesson();
    else if (lk === "u") undo();
    else if (lk === "q") setRound("start");
    else if (lk === "d") setRound("discover");
    else if (lk === "a") setRound("apply");
    else if (lk === "c") setRound("create");
    else if (lk === "r") setRound("recap");
    else if (R === "start" && (k === " " || k === "Enter")) startGame();
    else if (R === "discover") {
      if (k === " ") advance();
      else if (k === "ArrowRight" || k === "PageDown") nextWord();
      else if (k === "ArrowLeft" || k === "PageUp") prevWord();
      else if (lk === "h") hint();
      else if (lk === "l") letter();
      else if (lk === "w") reveal();
      else if (lk === "e") toStage(2);
      else if (lk === "p") cdPause(false);
      else if (lk === "k") cdSkip();
      else if (digit) award(+digit[1] - 1);
      else done = false;
    } else if (R === "apply") {
      if (k === " ") showAnswer();
      else if (k === "ArrowRight" || k === "PageDown") applyNav(1);
      else if (k === "ArrowLeft" || k === "PageUp") applyNav(-1);
      else if (digit && +digit[1] <= 3) choose(+digit[1] - 1);
      else done = false;
    } else if (R === "create") {
      if (k === " " || lk === "v") toggleModel();
      else if (k === "ArrowRight" || k === "PageDown") createNav(1);
      else if (k === "ArrowLeft" || k === "PageUp") createNav(-1);
      else if (digit) award(+digit[1] - 1);
      else done = false;
    } else done = false;
    if (done) e.preventDefault();
  });
  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { renderTower(); var t = $("tiles"); if (t) t.style.setProperty("--tw", tileWidth(t.children.length) + "px"); }, 120);
  });

  /* ---------------- boot ---------------- */
  buildTower();
  renderTicks();
  render();
  renderTower();
  renderLesson();
  setInterval(tick, 200);

  /* test / debug hook (read-only snapshot + a couple of helpers) */
  window.__SL = {
    state: function () { return state; },
    cd: function () { return { st: cd.st, left: cd.left, word: cd.word }; },
    lesson: function () { return { left: lesson.left, running: lesson.running, done: lesson.done }; },
    forceTwist: function (id) { var c = TW.filter(function (t) { return t.id === id; })[0]; if (c) showTwist(c); }
  };
})();
