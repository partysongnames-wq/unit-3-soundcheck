import { h, reducedMotion } from './net.js';
import { drawAvatar, drawZombie } from './art.js';
import { LANES, ROUND_NAMES } from './shared/karaoke.js';

// The client renders a server chart and sends only pad presses, never scores or tap times.
export function createKaraoke({ send, sound, avatar, active }) {
  const reduced = reducedMotion();
  const modal = h('section', { class: 'karaoke-modal hidden', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'AV karaoke arcade' });
  document.body.append(modal);
  let state = null, online = true, paused = false, elapsed = 0, received = 0, requestAt = 0, raf = 0, sync = null, previousFocus = null;
  let canvas, ctx, status, heading, stats, mascot, pads, feedback = 'Tap each note as it reaches the line!', feedbackUntil = 0, played = new Set();
  const nowElapsed = () => elapsed + (paused ? 0 : performance.now() - received);
  const muteButton = () => h('button', { class: 'btn small', onclick: (e) => { sound.ensure(); sound.sfxOn = !sound.sfxOn; e.currentTarget.textContent = sound.sfxOn ? 'Sound on ♪' : 'Sound off'; }, text: sound.sfxOn ? 'Sound on ♪' : 'Sound off' });
  function tap(lane) {
    if (!state || !online || paused) return;
    sound.ensure(); send({ t: 'karaoke_tap', nonce: state.nonce, lane });
    pads[lane].animate?.([{ filter: 'brightness(1.8)', transform: 'scale(.95)' }, {}], { duration: reduced ? 0 : 140 });
  }
  function stop() { cancelAnimationFrame(raf); clearInterval(sync); sync = null; state = null; active(false); }
  function hide() { stop(); modal.classList.add('hidden'); previousFocus?.focus(); }
  function frame() {
    if (!state) return;
    const t = nowElapsed(), round = Math.max(0, Math.min(2, Math.floor((t - 3000) / 10000)));
    heading.textContent = t < 3000 ? `Get ready… ${Math.max(1, Math.ceil((3000 - t) / 1000))}` : `Round ${round + 1} · ${ROUND_NAMES[round]}`;
    stats.textContent = `${state.score} score · ${state.combo} combo · ${Math.max(0, Math.ceil((state.ms - t) / 1000))}s`;
    status.textContent = !online ? 'Reconnecting… song continues. Missed beats count.' : paused ? 'Teacher paused the game' : t > state.ms ? 'Waiting for server results…' : feedback;
    pads.forEach(p => p.disabled = !online || paused || t >= state.ms);
    const w = canvas.width / 2, height = canvas.height / 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, w, height);
    const cols = ['#ff74b5', '#56d8ff', '#ffda67', '#69eba4'];
    cols.forEach((col, lane) => {
      const x = lane * w / 4; ctx.fillStyle = lane % 2 ? '#211d46' : '#17172f'; ctx.fillRect(x + 2, 0, w / 4 - 4, height);
      ctx.fillStyle = col; ctx.globalAlpha = .6; ctx.fillRect(x + 4, height - 44, w / 4 - 8, 5); ctx.globalAlpha = 1;
    });
    for (let i = 0; i < state.notes.length; i++) {
      const n = state.notes[i], delta = n.at - t;
      if (!played.has(i) && delta < 80 && delta > -100 && online && !paused) {
        played.add(i);
        if (sound.sfxOn && sound.ensure()) {
          const at = Math.max(0, delta / 1000);
          sound.note([523.25, 659.25, 783.99, 1046.5][n.lane], at, .17, { type: 'triangle', vol: .08 });
          sound.note(i % 2 ? 130.81 : 196, at, .12, { type: 'sine', vol: .09, slide: .5 });
        }
      }
      if (state.judged[i] !== null || delta > 1900 || delta < -320) continue;
      const x = (n.lane + .5) * w / 4, y = height - 42 - delta / 1900 * (height - 60);
      ctx.fillStyle = cols[n.lane]; ctx.beginPath(); ctx.roundRect(x - 24, y - 15, 48, 30, 8); ctx.fill();
      ctx.fillStyle = '#11132b'; ctx.font = 'bold 23px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(LANES[n.lane], x, y);
    }
    const m = mascot.getContext('2d'); m.clearRect(0, 0, 300, 95);
    const dance = !reduced && !paused && online;
    drawAvatar(m, 110, 88, 65, { avatar: avatar(), t: dance ? t / 1000 : 0, moving: dance, dir: 1, seed: 1 });
    drawZombie(m, 205, 88, 55, { t: dance ? t / 1000 : 0, dir: -1, seed: 4 });
    m.fillStyle = '#ffda67'; m.font = 'bold 12px sans-serif'; m.textAlign = 'center'; m.fillText(t < feedbackUntil ? 'THE ZOMBIE ATE MY HOMEWORK!' : 'Even zombies love a chorus.', 150, 13);
    raf = requestAnimationFrame(frame);
  }
  function open(m) {
    stop(); previousFocus = document.activeElement; active(true); state = m; elapsed = m.elapsed; received = performance.now(); played = new Set(m.notes.map((n, i) => n.at < elapsed ? i : -1));
    canvas = h('canvas', { class: 'karaoke-highway', width: 680, height: 480, 'aria-label': 'Four note lanes. Tap matching shapes at the glowing line.' }); ctx = canvas.getContext('2d');
    heading = h('h2'); stats = h('div', { class: 'karaoke-stats' }); status = h('p', { class: 'karaoke-feedback', role: 'status' });
    mascot = h('canvas', { width: 300, height: 95, class: 'karaoke-mascot', 'aria-hidden': 'true' });
    pads = LANES.map((label, lane) => h('button', { class: 'karaoke-pad lane-' + lane, 'aria-label': ['Pink star', 'Blue diamond', 'Yellow circle', 'Green triangle'][lane], onpointerdown: e => { e.preventDefault(); tap(lane); }, onclick: e => { if (e.detail === 0) tap(lane); }, text: label }));
    modal.replaceChildren(h('div', { class: 'karaoke-cabinet' },
      h('div', { class: 'karaoke-top' }, h('strong', { text: m.practice ? 'REHEARSAL · NO REWARDS' : 'AV · MIC DROP!' }), muteButton()), heading, stats, mascot, canvas,
      h('div', { class: 'karaoke-pads' }, pads), status,
      h('p', { class: 'karaoke-help', text: 'Match shapes at the line · Keys D F J K · 45% = +2, 70% = +3, 90% = +4' }),
      h('button', { class: 'btn small', onclick: () => send({ t: 'karaoke_close' }), text: 'Leave song · no reward' })));
    modal.classList.remove('hidden'); pads[0].focus();
    sync = setInterval(() => { if (online && state) { requestAt = performance.now(); send({ t: 'karaoke_sync' }); } }, 1000); frame();
  }
  function result(m) {
    stop(); active(true);
    const title = m.reason !== 'done' ? 'Song stopped' : m.accuracy >= 90 ? 'MIC DROP!' : m.accuracy >= 45 ? 'Homework? More like HOME ROCK!' : 'The zombie stole your rhythm!';
    modal.replaceChildren(h('div', { class: 'karaoke-cabinet karaoke-result' }, h('div', { class: 'karaoke-trophy', text: m.accuracy >= 70 ? '🏆' : '🎤' }), h('h1', { text: title }),
      h('p', { class: 'karaoke-stats', text: `${m.accuracy}% accuracy · ${m.hits}/${m.total} notes` }),
      h('h2', { text: m.score + ' arcade score' }), h('p', { text: `Best combo: ${m.best} · ${m.practice ? 'Practice only · no rewards' : '+' + m.points + ' game points'}` }),
      h('p', { text: m.points ? '+15 energy · +15 happiness (up to 100)' : m.practice && m.reason === 'done' ? 'Rehearsal complete! Ready for the classroom?' : m.reason === 'done' ? 'Keep following the shapes. You have got this!' : 'No rewards for an unfinished song.' }),
      h('button', { class: 'btn primary big', onclick: () => { send({ t: 'karaoke_ack' }); hide(); }, text: m.practice ? 'Back to stage · try again →' : 'Back to school →' })));
    modal.classList.remove('hidden'); modal.querySelector('button').focus();
  }
  window.addEventListener('keydown', e => { if (!state || e.repeat) return; const lane = 'dfjk'.indexOf(e.key.toLowerCase()); if (lane >= 0) { e.preventDefault(); tap(lane); } });
  // Keep keyboard focus inside the arcade while it is open.
  modal.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const buttons = [...modal.querySelectorAll('button:not(:disabled)')]; const first = buttons[0], last = buttons.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } });
  return {
    message(m) {
      if (m.t === 'karaoke') open(m);
      if (m.t === 'karaoke_end') result(m);
      if (m.t === 'karaoke_clock' && state) { elapsed = m.elapsed + Math.min(150, (performance.now() - requestAt) / 2); received = performance.now(); }
      if (m.t === 'karaoke_hit' && state) {
        if (m.i >= 0) state.judged[m.i] = m.verdict;
        Object.assign(state, { score: m.score, combo: m.combo, best: m.best });
        feedback = m.verdict === 'perfect' ? `PERFECT! ${m.combo} combo` : m.verdict === 'good' ? `Nice! ${m.combo} combo` : m.verdict === 'miss' ? 'Miss! Catch the next one.' : 'Oops! Follow the shape.';
        if (sound.sfxOn && sound.ensure()) {
          if (m.combo > 0 && m.combo % 10 === 0) { sound.note(1046.5, 0, .12, { type: 'triangle', vol: .09 }); sound.note(1568, .1, .2, { type: 'triangle', vol: .09 }); }
          if (m.verdict === 'wrong') sound.note(180, 0, .16, { type: 'triangle', vol: .045, slide: .5 });
        }
        if (m.verdict === 'wrong' || m.verdict === 'oops') feedbackUntil = nowElapsed() + 1400;
      }
    },
    phase(ph, pa) { if (paused !== !!pa && state) { elapsed = nowElapsed(); received = performance.now(); } paused = !!pa; if (ph === 'lobby' || ph === 'countdown') hide(); },
    connection(ok) { online = ok; },
  };
}
