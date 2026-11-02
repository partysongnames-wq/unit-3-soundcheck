// Small networking + DOM helpers shared by host and phone pages.
import qrcode from './vendor/qrcode.mjs';

export class ApiError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const res = await fetch(path, {
    method, signal, cache: 'no-store',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) throw new ApiError(res.status, data && data.error, (data && data.message) || `Request failed (${res.status})`);
  return data;
}

/** Long-poll loop with backoff. onState(view); onConn(status: 'ok'|'retrying'|'lost', err) */
export function startPolling({ code, headers, onState, onConn, onFatal }) {
  let since = 0; let stopped = false; let failures = 0; let ctrl = null;
  async function loop() {
    while (!stopped) {
      ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 30_000);
      try {
        const v = await api(`/api/rooms/${encodeURIComponent(code)}/state?since=${since}`, { headers: headers(), signal: ctrl.signal });
        clearTimeout(timeout);
        failures = 0; onConn && onConn('ok');
        since = v.version; onState(v);
      } catch (e) {
        clearTimeout(timeout);
        if (stopped) return;
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) { onFatal && onFatal(e); return; }
        failures++;
        onConn && onConn(failures > 3 ? 'lost' : 'retrying', e);
        await new Promise((r) => setTimeout(r, Math.min(8000, 600 * 2 ** Math.min(failures, 4))));
      }
    }
  }
  loop();
  return {
    stop() { stopped = true; if (ctrl) ctrl.abort(); },
    poke() { since = 0; if (ctrl) ctrl.abort(); }
  };
}

/** Tiny DOM builder. Text is always set via textContent (never innerHTML). */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function qrSvg(text, size = 220) {
  const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(); const q = 2; const total = n + q * 2;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `QR code for ${text}`);
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', total); bg.setAttribute('height', total); bg.setAttribute('fill', '#fff'); svg.append(bg);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#0b1024'); svg.append(p);
  return svg;
}

export const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const LETTERS = ['A', 'B', 'C', 'D'];
export function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null'); localStorage.setItem(key, JSON.stringify(val)); } catch { return null; } return val; }
