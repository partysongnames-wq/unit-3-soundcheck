import { api, store } from './net.js';
import { STARTER_PACK } from './shared/packs.js';
document.getElementById('rehearse').onclick = async e => {
  e.currentTarget.disabled = true;
  try {
    const r = await api('/api/rooms', { method: 'POST', body: { pack: STARTER_PACK, practice: true, settings: { minutes: 15, teams: 0, goal: 0, night: false } } });
    // Keep rehearsal identity separate from the student's saved competitive identity.
    store('afterhours.karaoke.rehearsal', { code: r.code, token: r.hostToken });
    location.href = `play.html?room=${r.code}&rehearsal=1`;
  } catch (err) { document.getElementById('message').textContent = err.message; e.currentTarget.disabled = false; }
};
