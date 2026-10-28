/* Prime Time — teacher-paced lesson engine. No network, no storage. */
(function () {
  'use strict';
  var D = window.PT_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var stage = $('#stage');
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---------- state (memory only) ---------- */
  var S = {
    idx: 0, step: 0, steps: [], timers: [],
    sound: false, reduce: false, classSize: 40,
    teams: [0, 0, 0, 0], undo: [], poll: [0, 0, 0, 0], pairsUsed: [],
    double: false
  };
  var TEAM = ['CH 1', 'CH 2', 'CH 3', 'CH 4'];

  /* ---------- sound (WebAudio, off by default) ---------- */
  var ac = null;
  function ctx() { if (!ac) { var A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } return ac; }
  function tone(freq, dur, type, vol, when) {
    if (!S.sound || !ctx()) return;
    var t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function hiss(dur) {
    if (!S.sound || !ctx()) return;
    var n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = 0.07;
    s.buffer = b; s.connect(g).connect(ac.destination); s.start();
  }
  var sfx = {
    tick: function (i) { tone(520 + i * 60, 0.08, 'square', 0.05); },
    reveal: function () { hiss(0.25); tone(660, 0.18, 'triangle', 0.1, 0.2); tone(990, 0.3, 'triangle', 0.1, 0.32); },
    end: function () { tone(220, 0.5, 'sawtooth', 0.08); },
    good: function () { tone(784, 0.12, 'triangle', 0.1); tone(1175, 0.25, 'triangle', 0.1, 0.1); }
  };

  /* ---------- effects ---------- */
  var staticEl = $('#static');
  function flash() {
    if (S.reduce) return;
    staticEl.classList.remove('flash'); void staticEl.offsetWidth; staticEl.classList.add('flash');
  }
  function reveal(el, html) {
    el.innerHTML = html; el.classList.remove('reveal'); void el.offsetWidth; el.classList.add('reveal');
    sfx.reveal();
  }
  function later(fn, ms) { var id = setTimeout(fn, ms); S.timers.push(id); return id; }
  function every(fn, ms) { var id = setInterval(fn, ms); S.timers.push(id); return id; }
  function clearTimers() { S.timers.forEach(function (id) { clearTimeout(id); clearInterval(id); }); S.timers = []; }
  function countdown(el, secs, onEnd) {
    var left = secs; el.textContent = left; el.classList.remove('locked');
    sfx.tick(0);
    var id = every(function () {
      left--;
      if (left <= 0) { clearInterval(id); el.textContent = '0'; sfx.end(); if (onEnd) onEnd(); return; }
      el.textContent = left; sfx.tick(secs - left);
    }, 1000);
  }
  function mmss(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- icons (draw themselves via pathLength) ---------- */
  var ICON = {
    cartoon: '<circle cx="50" cy="60" r="24"/><path d="M38 40C30 10 40 8 44 37"/><path d="M62 40C70 10 60 8 56 37"/><path d="M40 66Q50 76 60 66"/>',
    chat: '<path d="M14 40h40a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H30l-10 8v-8h-6a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6z"/><path d="M58 16h28a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-4v8l-10-8H58a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6z"/><path d="M14 86h72"/>',
    comedy: '<rect x="40" y="12" width="20" height="34" rx="10"/><path d="M32 36a18 18 0 0 0 36 0"/><path d="M50 54V84"/><path d="M34 86h32"/>',
    crime: '<circle cx="42" cy="42" r="24"/><path d="M60 60L86 86"/><path d="M32 40q10-10 20 0"/>',
    doc: '<circle cx="50" cy="50" r="34"/><ellipse cx="50" cy="50" rx="14" ry="34"/><path d="M17 40h66M17 60h66"/>',
    drama: '<path d="M50 84L18 50A16 16 0 0 1 50 28A16 16 0 0 1 82 50Z"/><path d="M50 30l-6 16 10 8-6 16"/>',
    fantasy: '<path d="M50 8l8 14v44H42V22z"/><path d="M28 66h44"/><path d="M50 66v16"/><circle cx="50" cy="87" r="5"/>',
    film: '<rect x="16" y="44" width="68" height="40" rx="4"/><path d="M16 44l62-20 4 12-62 20"/><path d="M36 38l4-10M54 32l4-10"/>',
    food: '<path d="M16 56h54v6a14 14 0 0 1-14 14H30a14 14 0 0 1-14-14z"/><path d="M70 60h20"/><path d="M34 44q-6-8 0-16t0-16M50 44q-6-8 0-16t0-16"/>',
    game: '<path d="M24 70a26 26 0 0 1 52 0z"/><rect x="16" y="70" width="68" height="14" rx="3"/><path d="M50 32V18M30 38l-7-9M70 38l7-9"/>',
    reality: '<path d="M14 48L50 18l36 30v38H14z"/><path d="M30 64q20-18 40 0-20 18-40 0z"/><circle cx="50" cy="64" r="5"/>',
    scifi: '<ellipse cx="50" cy="56" rx="38" ry="12"/><path d="M30 50a20 18 0 0 1 40 0"/><path d="M36 72l-8 14M64 72l8 14M50 68v18"/>',
    sport: '<circle cx="50" cy="50" r="34"/><path d="M50 32l14 10-5 16H41l-5-16z"/><path d="M50 16v16M64 42l17-6M59 58l10 14M41 58L31 72M36 42l-17-6"/>',
    talent: '<path d="M50 12l10 22 24 2-18 16 6 24-22-13-22 13 6-24-18-16 24-2z"/><path d="M20 90h60"/>',
    news: '<path d="M50 42L34 88M50 42l16 46M40 70h20"/><circle cx="50" cy="36" r="5"/><path d="M38 24a18 18 0 0 0 0 24M62 24a18 18 0 0 1 0 24M28 14a32 32 0 0 0 0 44M72 14a32 32 0 0 1 0 44"/>',
    tv: '<rect x="12" y="30" width="76" height="54" rx="8"/><path d="M36 12l14 18 14-18"/><path d="M30 92h40"/>'
  };
  function icon(name, label) {
    var inner = ICON[name].replace(/<(path|circle|rect|ellipse)/g, '<$1 pathLength="1"');
    return '<svg viewBox="0 0 100 100" role="img" aria-label="' + esc(label) + '">' + inner + '</svg>';
  }

  /* ---------- team scores ---------- */
  function award(list, why) { // list of [team, points]
    if (!list.length) return;
    list.forEach(function (p) { S.teams[p[0]] += p[1]; });
    S.undo.push(list); sfx.good(); paintScores();
  }
  function undo() {
    var last = S.undo.pop(); if (!last) return;
    last.forEach(function (p) { S.teams[p[0]] -= p[1]; }); paintScores();
  }
  function resetScores() { S.teams = [0, 0, 0, 0]; S.undo = []; paintScores(); }
  function paintScores() {
    var max = Math.max.apply(null, S.teams);
    document.querySelectorAll('[data-score]').forEach(function (el) { el.textContent = S.teams[+el.dataset.score]; });
    document.querySelectorAll('[data-team]').forEach(function (el) { el.classList.toggle('lead', max > 0 && S.teams[+el.dataset.team] === max); });
  }
  function teamsHTML() {
    return '<div class="teams">' + TEAM.map(function (t, i) {
      return '<div class="team" data-team="' + i + '"><h3>' + t + '</h3><button type="button" class="plus" data-plus="' + i + '" aria-label="Add point to ' + t + '">+' + (S.double ? 2 : 1) + '</button><span class="pts" data-score="' + i + '">' + S.teams[i] + '</span></div>';
    }).join('') + '</div><div class="score-tools"><button type="button" class="btn ghost" data-undo>Undo</button><button type="button" class="btn ghost" data-reset>Reset scores</button></div>';
  }
  function wireTeams(root) {
    root.querySelectorAll('[data-plus]').forEach(function (b) {
      b.addEventListener('click', function () { award([[+b.dataset.plus, S.double ? 2 : 1]]); });
    });
    var u = root.querySelector('[data-undo]'); if (u) u.addEventListener('click', undo);
    var r = root.querySelector('[data-reset]');
    if (r) r.addEventListener('click', function () {
      if (r.dataset.armed) { resetScores(); r.textContent = 'Reset scores'; delete r.dataset.armed; return; }
      r.dataset.armed = '1'; r.textContent = 'Press again to reset';
      later(function () { r.textContent = 'Reset scores'; delete r.dataset.armed; }, 3000);
    });
    paintScores();
  }

  /* ---------- screens ---------- */
  var screens = [];
  function add(ep, cap, build) { screens.push({ ep: ep, cap: cap, build: build }); }

  // Start
  add(-1, D.captions.start, function (el) {
    el.className = 'screen start';
    el.innerHTML = '<p class="kicker">Tonight · 50 min · Gateway B1 Unit 5</p>' +
      '<h1 class="h-xl">Prime<span>Time</span></h1>' +
      '<p class="ep"><b>NOW SHOWING</b>Episode 1: Screen Time</p>' +
      '<button type="button" class="btn amber big" id="startBtn">Start</button>';
    $('#startBtn', el).addEventListener('click', function () { go(S.idx + 1); });
    return [];
  });

  // E0 cold open
  add(0, D.captions.cold, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Cold open <span class="dim">· From the archive</span></p>' +
      '<div class="vintage"><div class="crt" id="crt"><div class="noise"></div><div class="pic" id="pic"></div></div>' +
      '<div><ul class="lines" id="lines"></ul><p class="ask" id="ask"></p><p class="hint" id="hintC">Press <kbd>Space</kbd> for the next line.</p></div></div>';
    var steps = D.coldOpen.lines.map(function (line) {
      return function () { var li = document.createElement('li'); li.textContent = line; $('#lines', el).appendChild(li); };
    });
    steps.push(function () { $('#ask', el).textContent = 'What is it?'; $('#hintC', el).textContent = 'Take guesses, then press Space to tune in.'; S.cap(D.captions.coldAsk); });
    steps.push(function () {
      $('#crt', el).classList.add('tuned'); flash();
      reveal($('#pic', el), icon('tv', 'Old television set') + '<p>' + esc(D.coldOpen.answer) + '</p>');
      $('#hintC', el).textContent = '';
    });
    return steps;
  });
  add(0, D.captions.poll, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">And today?</p><h2 class="h-l">What\'s in <span style="color:var(--amber)">YOUR</span> bedroom?</h2>' +
      '<p class="hint">Hands up. Hours of screen time yesterday — teacher taps the count.</p><div class="poll">' +
      D.coldOpen.poll.map(function (lab, i) {
        return '<div class="poll-col"><h3>' + lab + '<small>hrs</small></h3><div class="bar-wrap"><div class="bar-fill" data-bar="' + i + '"></div><span class="bar-num" data-num="' + i + '"></span></div>' +
          '<div class="poll-btns"><button type="button" data-inc="' + i + '" aria-label="Add one to ' + lab + ' hours">+1</button><button type="button" data-dec="' + i + '" aria-label="Remove one from ' + lab + ' hours">−</button></div></div>';
      }).join('') + '</div>';
    function paint() {
      var max = Math.max(5, Math.max.apply(null, S.poll));
      S.poll.forEach(function (n, i) { $('[data-bar="' + i + '"]', el).style.height = (n / max * 100) + '%'; $('[data-num="' + i + '"]', el).textContent = n; });
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.inc) S.poll[+b.dataset.inc]++;
      if (b.dataset.dec) S.poll[+b.dataset.dec] = Math.max(0, S.poll[+b.dataset.dec] - 1);
      paint();
    });
    S.repaintPoll = paint; paint();
    return [];
  });

  // E1 guess the genre
  D.genres.forEach(function (g, i) {
    add(1, D.captions.genre, function (el) {
      el.className = 'screen';
      el.innerHTML = '<p class="kicker">Guess the genre <span class="dim">· Card ' + (i + 1) + ' of ' + D.genres.length + '</span></p>' +
        '<div class="card"><div class="icon-frame">' + icon(g.icon, 'Clue icon') + '</div>' +
        '<div class="listing"><p class="time">ON TONIGHT · ' + (18 + (i % 6)) + ':' + (i % 2 ? '30' : '00') + '</p>' +
        '<p class="desc">' + esc(g.desc) + '</p>' +
        '<div class="slot" id="slot"><span class="hint">Call it out. Then <kbd>Space</kbd> to switch channel.</span></div></div></div>';
      var slot = $('#slot', el);
      return [
        function () { flash(); reveal(slot, '<span class="word">' + esc(g.word) + '</span>'); },
        function () { var s = document.createElement('span'); s.className = 'ex reveal'; s.innerHTML = 'Example: <b>' + esc(g.ex) + '</b>'; slot.appendChild(s); }
      ];
    });
  });
  add(1, D.captions.often, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Your turn · Speak</p><h2 class="h-l">How often do you watch each type?</h2>' +
      '<div class="freq"><div>every day</div><div>sometimes</div><div>never</div></div>' +
      '<p class="hint" style="font-size:calc(var(--u)*3)">“I watch <b>cartoons</b> every day. I never watch <b>chat shows</b>.”</p>';
    return [];
  });
  add(1, D.captions.news, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Language note</p><p class="big-quote">“The news <span id="isSlot"><span class="strike">are</span></span> on at 8.”</p>' +
      '<p class="hint" id="newsHint">Something is wrong. What? <kbd>Space</kbd></p>';
    return [function () {
      reveal($('#isSlot', el), '<em>IS</em>');
      $('#newsHint', el).innerHTML = '<b style="color:var(--ink)">the news</b> is singular — always <b style="color:var(--ink)">is</b>, never <i>are</i>.';
    }];
  });

  // E2 word bank
  add(2, D.captions.bank, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Word bank · Exercise 2</p><h2 class="h-m">Ten words. Coming up.</h2><div class="bank">' +
      D.bank.map(function (_, i) { return '<div class="tile" data-tile="' + i + '"><span aria-hidden="true">?</span><span class="sr">Hidden word ' + (i + 1) + '</span></div>'; }).join('') +
      '</div><div class="row-flex"><button type="button" class="btn ghost" id="allBtn">Reveal all</button><span class="hint"><kbd>Space</kbd> reveals one at a time.</span></div>';
    var steps = D.bank.map(function (w, i) {
      return function () { var t = $('[data-tile="' + i + '"]', el); t.classList.add('on'); reveal(t, esc(w)); };
    });
    $('#allBtn', el).addEventListener('click', function () { while (S.step < S.steps.length) S.steps[S.step++](); updateCount(); });
    return steps;
  });

  // E2 quiz
  D.quiz.forEach(function (q, i) {
    add(2, D.captions.quiz, function (el) {
      var votes = [null, null, null, null], locked = false;
      el.className = 'screen';
      el.innerHTML = '<p class="q-num">TRUE OR FALSE? · ' + (i + 1) + ' / ' + D.quiz.length + '</p>' +
        '<p class="q-text">' + esc(q.pre) + ' <span class="gap" id="gap"><span class="sr">blank</span>&nbsp;</span> ' + esc(q.post) + '</p>' +
        '<div class="votes">' + TEAM.map(function (t, k) {
          return '<div class="vote" data-team="' + k + '"><h3>' + t + ' <span data-score="' + k + '">' + S.teams[k] + '</span></h3><div class="tf" role="group" aria-label="' + t + ' vote">' +
            '<button type="button" class="t" data-v="' + k + ':1" aria-pressed="false">TRUE</button><button type="button" class="f" data-v="' + k + ':0" aria-pressed="false">FALSE</button></div></div>';
        }).join('') + '</div>' +
        '<div class="verdict-row"><span class="countdown locked" id="cd">VOTE</span><div><div class="verdict" id="verdict"></div><p class="fact" id="fact"></p></div></div>' +
        '<div class="row-flex"><span class="hint" id="qHint"><kbd>Space</kbd> fill the gap → vote (5 s) → verdict. Teams that vote right score +1.</span><button type="button" class="btn ghost" data-undo>Undo</button></div>';
      el.querySelectorAll('[data-v]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (locked) return;
          var p = b.dataset.v.split(':'), k = +p[0], v = p[1] === '1';
          votes[k] = votes[k] === v ? null : v;
          el.querySelectorAll('[data-v^="' + k + ':"]').forEach(function (x) { x.setAttribute('aria-pressed', String(votes[k] !== null && (x.dataset.v.slice(-1) === '1') === votes[k])); });
        });
      });
      $('[data-undo]', el).addEventListener('click', undo);
      return [
        function () { flash(); reveal($('#gap', el), esc(q.a)); },
        function () { countdown($('#cd', el), 5, function () { $('#cd', el).textContent = 'LOCKED'; $('#cd', el).classList.add('locked'); locked = true; }); },
        function () {
          locked = true; clearTimers(); $('#cd', el).textContent = ''; flash();
          var v = $('#verdict', el); v.className = 'verdict ' + (q.v ? 'true' : 'false');
          reveal(v, q.v ? 'TRUE' : 'FALSE'); $('#fact', el).textContent = q.fact;
          var won = []; votes.forEach(function (x, k) { if (x === q.v) { won.push([k, 1]); $('[data-team="' + k + '"]', el).classList.add('won'); } });
          award(won); $('#qHint', el).textContent = won.length ? won.length + ' team' + (won.length > 1 ? 's' : '') + ' scored.' : 'Nobody scored. Brutal.';
        }
      ];
    });
  });

  // E3 sort
  add(3, D.captions.sort, function (el) {
    var st = D.adjectives.map(function () { return { on: false, col: 0 }; }), sel = -1, checked = false;
    var NAMES = ['', 'Positive', 'Negative', 'Both'];
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Exercise 3 · Positive or negative?</p>' +
      '<div class="pool" id="pool"></div>' +
      '<div class="cols">' + [1, 2, 3].map(function (c) {
        return '<div class="col ' + ['', 'pos', 'neg', 'both'][c] + '"><h3><button type="button" class="btn ghost" data-col="' + c + '" style="font:inherit;padding:.1em .4em;border:0;min-height:0">' + NAMES[c].toUpperCase() + '</button><kbd>' + c + '</kbd></h3><div class="in" id="col' + c + '"></div></div>';
      }).join('') + '</div>' +
      '<div class="row-flex"><span class="hint" id="sHint">Click a <b>?</b> chip (or <kbd>Space</kbd>) to reveal. Class shouts the column. Move it: click the column or press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>.</span>' +
      '<button type="button" class="btn ghost" id="checkBtn">Check answers</button></div>';
    function chip(i) {
      var s = st[i], a = D.adjectives[i];
      return '<button type="button" class="wchip' + (s.on ? ' on' : '') + (checked && s.col ? (s.col === a.c ? ' ok' : ' bad') : '') + '" data-chip="' + i + '" aria-pressed="' + (sel === i) + '">' +
        (s.on ? esc(a.w) : '<span aria-hidden="true">?</span><span class="sr">Hidden word ' + (i + 1) + '</span>') + '</button>';
    }
    function paint(fresh) {
      $('#pool', el).innerHTML = st.map(function (s, i) { return s.col ? '' : chip(i); }).join('');
      [1, 2, 3].forEach(function (c) { $('#col' + c, el).innerHTML = st.map(function (s, i) { return s.col === c ? chip(i) : ''; }).join(''); });
      if (fresh !== undefined) { var f = $('[data-chip="' + fresh + '"]', el); if (f) { f.classList.add('reveal'); sfx.reveal(); } }
    }
    function open(i) { if (!st[i].on) { st[i].on = true; flash(); sel = i; paint(i); } else { sel = sel === i ? -1 : i; paint(); } }
    S.sortMove = function (c) { if (sel < 0 || !st[sel].on) return false; st[sel].col = c; sel = -1; paint(); return true; };
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-chip]'); if (b) return open(+b.dataset.chip);
      var c = e.target.closest('[data-col]'); if (c) S.sortMove(+c.dataset.col);
    });
    $('#checkBtn', el).addEventListener('click', function () {
      checked = true; paint();
      var ok = st.filter(function (s, i) { return s.col === D.adjectives[i].c; }).length;
      $('#sHint', el).textContent = ok + ' of 12 in the right column. “Scary” goes in BOTH — a horror fan says it like a compliment.';
    });
    paint();
    return D.adjectives.map(function (_, i) { return function () { var n = st.findIndex(function (s) { return !s.on; }); if (n >= 0) open(n); }; });
  });

  // E4 game
  add(4, D.captions.game, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Game slot · 4 teams</p><h2 class="h-l">Binge <span style="color:var(--amber)">or</span> Skip?</h2>' +
      '<p class="fact">A clue appears through the static. Ten seconds. First team with the right word gets the point. Watch out for the plot twists.</p>' +
      teamsHTML() +
      '<div class="row-flex"><a class="btn ghost" href="https://screen-time-word-game.pages.dev" target="_blank" rel="noopener noreferrer">Open adjectives game ↗<span class="sr"> (opens in a new tab)</span></a><span class="hint"><kbd>Space</kbd> for round 1.</span></div>';
    wireTeams(el);
    return [];
  });
  var pendingDouble = [];
  var deck = shuffle(D.clues), nextTwist = 3 + Math.floor(Math.random() * 3), sinceTwist = 0;
  deck.forEach(function (c, r) {
    add(4, D.captions.game, function (el) {
      el.className = 'screen';
      el.innerHTML = '<div class="round-head"><p class="kicker">Round ' + (r + 1) + ' <span class="dim">/ ' + deck.length + '</span></p>' + '</div>' +
        '<div class="tvbox" id="tvb"><div class="noise"></div><p class="clue" id="clue"><span class="muted">Signal incoming… <kbd style="font-style:normal">Space</kbd></span></p><div class="ans" id="ans"></div><span class="cd" id="cd"></span></div>' +
        teamsHTML();
      wireTeams(el);
      return [
        function () { $('#tvb', el).classList.add('clear'); reveal($('#clue', el), esc(c.q)); countdown($('#cd', el), 10); },
        function () { clearTimers(); $('#cd', el).textContent = ''; flash(); reveal($('#ans', el), esc(c.a)); }
      ];
    });
    sinceTwist++;
    if (sinceTwist === nextTwist && r < deck.length - 1) {
      var tw = D.twists[Math.floor(Math.random() * D.twists.length)], nextRound = screens.length + 1;
      add(4, D.captions.twist, function (el) {
        el.className = 'screen twist';
        el.innerHTML = '<p class="kicker">Breaking</p><h2 class="h-xl">Plot twist</h2><div id="tw" class="h-m"></div><p id="twd"></p><span class="hint"><kbd>Space</kbd> to reveal.</span>';
        return [function () { flash(); reveal($('#tw', el), esc(tw.t)); $('#twd', el).textContent = tw.d; }];
      });
      if (tw.t === 'Double points') pendingDouble.push(nextRound);
      sinceTwist = 0; nextTwist = 3 + Math.floor(Math.random() * 3);
    }
  });

  // E5 pair talk
  add(5, D.captions.model, function (el) {
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Pair talk · Model</p>' +
      '<blockquote class="model lead"><p>' + hl(D.models[0]) + '</p></blockquote>' +
      '<blockquote class="model" id="m2" hidden><p>' + hl(D.models[1]) + '</p></blockquote>' +
      '<span class="hint" id="mHint"><kbd>Space</kbd> for the longer model.</span>';
    return [function () { $('#m2', el).hidden = false; $('#m2', el).classList.add('reveal'); $('#mHint', el).textContent = ''; }];
  });
  function hl(t) {
    return esc(t).replace(/\b(informative|dull|original|entertaining|science-fiction series|channel|streaming service|seasons|viewers|documentaries)\b/g, '<mark>$1</mark>');
  }
  add(5, D.captions.talk, function (el) {
    var left = 180, run = null;
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Pair talk · Your favourite programme</p><div class="talk"><ol class="frames">' +
      D.frames.map(function (f) { return '<li>' + esc(f).replace(/____/g, '<u style="text-decoration:none;border-bottom:2px solid var(--amber);display:inline-block;min-width:2.4em">&nbsp;</u>') + '</li>'; }).join('') +
      '</ol><div class="side"><div class="mega" id="talkT" role="timer" aria-label="Pair talk timer">3:00</div>' +
      '<div class="row-flex"><button type="button" class="btn" id="talkGo">Start 3 min</button><button type="button" class="btn ghost" id="talkReset">Reset</button></div>' +
      '<p class="kicker" style="margin-top:calc(var(--u)*2)">Pair on the mic</p><div class="pair" id="pair" aria-live="polite">— —</div>' +
      '<button type="button" class="btn amber" id="pickBtn">Pick a pair</button></div></div>';
    var T = $('#talkT', el), go_ = $('#talkGo', el);
    function toggle() {
      if (run) { clearInterval(run); run = null; go_.textContent = 'Resume'; T.classList.remove('run'); return; }
      if (left <= 0) left = 180;
      T.classList.add('run'); go_.textContent = 'Pause';
      run = every(function () { left--; T.textContent = mmss(left); if (left <= 0) { clearInterval(run); run = null; sfx.end(); T.classList.remove('run'); go_.textContent = 'Start 3 min'; } }, 1000);
    }
    go_.addEventListener('click', toggle);
    $('#talkReset', el).addEventListener('click', function () { if (run) toggle(); left = 180; T.textContent = '3:00'; go_.textContent = 'Start 3 min'; });
    $('#pickBtn', el).addEventListener('click', function () {
      var n = S.classSize, free = [];
      for (var k = 1; k <= n; k++) if (S.pairsUsed.indexOf(k) < 0) free.push(k);
      if (free.length < 2) { S.pairsUsed = []; free = []; for (k = 1; k <= n; k++) free.push(k); }
      var pick = shuffle(free).slice(0, 2).sort(function (a, b) { return a - b; });
      S.pairsUsed = S.pairsUsed.concat(pick); flash();
      reveal($('#pair', el), pick[0] + '<small>&amp;</small>' + pick[1]);
    });
    return [toggle];
  });

  // E6 exit ticket
  add(6, D.captions.exit, function (el) {
    var left = 120;
    el.className = 'screen';
    el.innerHTML = '<p class="kicker">Exit ticket · 2 minutes</p><h2 class="h-m">Write ONE sentence.</h2>' +
      '<p class="exit-line">My favourite programme is <u>&nbsp;</u>. It\'s a <u>&nbsp;</u> and it\'s <u>&nbsp;</u> because <u style="min-width:6em">&nbsp;</u>.</p>' +
      '<div class="row-flex"><div class="mega" id="exitT" role="timer" aria-label="Exit ticket timer">2:00</div><button type="button" class="btn" id="exitGo">Start</button></div>';
    var go_ = $('#exitGo', el), T = $('#exitT', el), run = null;
    function start() {
      if (run) return; T.classList.add('run'); go_.disabled = true; go_.textContent = 'Running';
      run = every(function () { left--; T.textContent = mmss(left); if (left <= 0) { clearInterval(run); sfx.end(); T.classList.remove('run'); go_.textContent = 'Pens down'; } }, 1000);
    }
    go_.addEventListener('click', start);
    return [start];
  });
  add(6, D.captions.wrap, function (el) {
    el.className = 'screen start';
    el.innerHTML = '<p class="kicker">End credits</p><h1 class="h-xl">That\'s a<span>wrap.</span></h1><p class="ep">Hand in your ticket on the way out.</p>';
    return [];
  });

  // Mark rounds that follow a "Double points" twist
  pendingDouble.forEach(function (n) {
    var sc = screens[n]; if (!sc) return;
    var b = sc.build; sc.build = function (el) { var r = b(el); S.double = true; el.querySelector('.round-head').insertAdjacentHTML('beforeend', '<span class="badge">DOUBLE POINTS</span>'); el.querySelectorAll('[data-plus]').forEach(function (p) { p.textContent = '+2'; }); return r; };
  });

  /* ---------- navigation ---------- */
  var firstOf = {};
  screens.forEach(function (s, i) { if (!(s.ep in firstOf)) firstOf[s.ep] = i; });
  var chipsEl = $('#chips');
  chipsEl.innerHTML = D.episodes.map(function (e, i) {
    return '<button type="button" class="chip" data-ep="' + i + '" aria-label="' + e.key + ' ' + esc(e.name) + '"><b>' + e.key + '</b><span>' + esc(e.name) + '</span></button>';
  }).join('');
  chipsEl.addEventListener('click', function (e) { var b = e.target.closest('[data-ep]'); if (b) go(firstOf[+b.dataset.ep]); });

  S.cap = function (t) { $('#caption').textContent = t; };
  var lastEp = null;
  function go(i) {
    if (i < 0 || i >= screens.length) return;
    clearTimers(); S.double = false; S.sortMove = null;
    var sc = screens[i]; S.idx = i; S.step = 0;
    var el = document.createElement('section');
    stage.innerHTML = ''; stage.appendChild(el);
    S.steps = sc.build(el) || [];
    document.body.classList.toggle('is-start', sc.ep < 0);
    S.cap(sc.cap);
    chipsEl.querySelectorAll('[data-ep]').forEach(function (b) {
      if (+b.dataset.ep === sc.ep) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    if (sc.ep !== lastEp && sc.ep >= 0 && !timer.running) timer.set(D.episodes[sc.ep].min * 60);
    lastEp = sc.ep;
    flash(); updateCount();
  }
  function updateCount() {
    var sc = screens[S.idx], list = screens.filter(function (s) { return s.ep === sc.ep; });
    $('#count').textContent = sc.ep < 0 ? '' : D.episodes[sc.ep].key + ' · ' + (list.indexOf(sc) + 1) + '/' + list.length;
  }
  function next() {
    if (S.step < S.steps.length) { S.steps[S.step++](); updateCount(); return; }
    go(S.idx + 1);
  }
  function back() { go(S.idx - 1); }
  $('#next').addEventListener('click', next);
  $('#prev').addEventListener('click', back);

  /* ---------- lesson timer ---------- */
  var tBtn = $('#timer'), tEdit = $('#timerEdit'), tIn = $('#timerInput'), tTog = $('#timerToggle');
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>', PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  var timer = {
    left: 300, running: false, id: null,
    set: function (s) { this.left = s; this.paint(); tBtn.classList.remove('done'); },
    paint: function () { tBtn.textContent = mmss(this.left); tBtn.classList.toggle('run', this.running); tTog.innerHTML = this.running ? PAUSE : PLAY; tTog.setAttribute('aria-label', this.running ? 'Pause timer' : 'Start timer'); tTog.setAttribute('aria-pressed', String(this.running)); },
    toggle: function () {
      var t = this;
      if (t.running) { clearInterval(t.id); t.running = false; t.paint(); return; }
      if (t.left <= 0) return;
      t.running = true; tBtn.classList.remove('done');
      t.id = setInterval(function () { t.left--; if (t.left <= 0) { clearInterval(t.id); t.running = false; tBtn.classList.add('done'); sfx.end(); } t.paint(); }, 1000);
      t.paint();
    }
  };
  tTog.addEventListener('click', function () { timer.toggle(); });
  tBtn.addEventListener('click', function () { tIn.value = mmss(timer.left); tBtn.hidden = true; tEdit.hidden = false; tIn.focus(); tIn.select(); });
  function closeEdit(apply) {
    if (tEdit.hidden) return;
    if (apply) {
      var v = tIn.value.trim(), m = v.match(/^(\d{1,3})(?::(\d{1,2}))?$/) || v.match(/^(\d+(?:\.\d+)?)$/);
      if (m) timer.set(v.indexOf(':') > 0 ? (+m[1]) * 60 + (+m[2] || 0) : Math.round(parseFloat(v) * 60));
    }
    tEdit.hidden = true; tBtn.hidden = false; tBtn.focus();
  }
  tIn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); closeEdit(e.key === 'Enter'); }
  });
  tIn.addEventListener('blur', function () { closeEdit(true); });

  /* ---------- teacher panel ---------- */
  var panel = $('#panel'), gear = $('#gear');
  function togglePanel(open) {
    open = open === undefined ? panel.hidden : open;
    panel.hidden = !open; gear.setAttribute('aria-expanded', String(open));
    if (open) $('#optSound').focus(); else gear.focus();
  }
  gear.addEventListener('click', function () { togglePanel(); });
  $('#panelClose').addEventListener('click', function () { togglePanel(false); });
  $('#optSound').addEventListener('change', function (e) { S.sound = e.target.checked; if (S.sound && ctx() && ac.state === 'suspended') ac.resume(); });
  $('#optMotion').addEventListener('change', function (e) { S.reduce = e.target.checked; document.documentElement.classList.toggle('reduce', S.reduce); });
  $('#optClass').addEventListener('change', function (e) { var n = parseInt(e.target.value, 10); if (n >= 2 && n <= 60) { S.classSize = n; S.pairsUsed = []; } });
  $('#resetScores').addEventListener('click', resetScores);
  $('#resetPoll').addEventListener('click', function () { S.poll = [0, 0, 0, 0]; if (S.repaintPoll && document.contains(stage.querySelector('.poll'))) S.repaintPoll(); });
  $('#resetPairs').addEventListener('click', function () { S.pairsUsed = []; });
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { S.reduce = true; $('#optMotion').checked = true; document.documentElement.classList.add('reduce'); }

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    var t = e.target, tag = t && t.tagName;
    if (e.key === 'Escape' && !panel.hidden) { togglePanel(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var k = e.key;
    if (k === ' ' || k === 'Spacebar' || k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); next(); return; }
    if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); back(); return; }
    if (/^[0-9]$/.test(k)) {
      var n = +k;
      if (S.sortMove && n >= 1 && n <= 3 && S.sortMove(n)) return;
      if (n in firstOf) go(firstOf[n]);
      return;
    }
    switch (k.toLowerCase()) {
      case 'f': if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); break;
      case 't': timer.toggle(); break;
      case 's': togglePanel(); break;
    }
  });

  // Read-only hook for the automated tests (position only, never content)
  window.PT = { info: function () { return { idx: S.idx, step: S.step, steps: S.steps.length, total: screens.length, ep: screens[S.idx].ep }; } };

  go(0);
})();
