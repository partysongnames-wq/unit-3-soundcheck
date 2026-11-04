import { api, h } from './net.js';
import { CREWS } from './shared/world.js';
const $ = (id) => document.getElementById(id);
const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const token = (new URLSearchParams(location.hash.slice(1)).get('v') || '').replace(/[^a-f0-9]/g, '');
const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
async function refresh() {
  try {
    const d = await api(`/api/rooms/${room}/teacher`, { headers: { 'X-View-Token': token } });
    $('hdr').textContent = `Game ${d.code} · ${d.phase}${d.paused ? ' (paused)' : ''}${d.phase === 'play' ? ` · ${fmt(d.timeLeft)} left` : ''}`;
    const quiet = d.players.filter((p) => p.online && (p.sinceAnswerS ?? 0) > 60).length;
    $('sum').textContent = `${d.players.length} players · ${d.answers} answers · class accuracy ${d.accuracy === null ? '–' : Math.round(d.accuracy * 100) + '%'}${d.phase === 'play' ? ` · ${quiet} not answered in 60 s` : ''}`;
    $('rows').replaceChildren(...d.players.map((p) => h('tr', { class: d.phase === 'play' && p.online && (p.sinceAnswerS ?? 0) > 60 ? 'warn' : '' },
      h('td', {}, h('span', { class: 'dot', style: { background: CREWS[p.crew].color } }), p.name + (p.bot ? ' (bot)' : '')),
      h('td', { text: String(p.answered) }),
      h('td', { text: p.answered ? `${p.correct} (${Math.round((p.correct / p.answered) * 100)}%)` : '–' }),
      h('td', { text: p.sinceAnswerS === null ? '–' : `${p.sinceAnswerS}s ago` }),
      h('td', { class: 'st', text: p.status }))));
    $('qs').replaceChildren(...d.questions.filter((q) => q.n).sort((a, b) => a.acc - b.acc).map((q) => h('div', { class: 'q', text: `${Math.round(q.acc * 100)}% · ${q.n} tries — Q${q.i + 1}. ${q.prompt}` })));
  } catch (e) { $('sum').replaceChildren(h('span', { class: 'err', text: `Can't load: ${e.message}` })); }
}
if (!room || !token) $('sum').textContent = 'This link is incomplete. Scan the 📋 code on the teacher screen again.';
else { refresh(); setInterval(refresh, 3000); }
