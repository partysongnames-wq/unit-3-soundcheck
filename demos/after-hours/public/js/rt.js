// Real-time connection with automatic reconnect.
export function connect({ hello, onMessage, onStatus }) {
  let ws = null; let tries = 0; let closed = false; let timer = null;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  function open() {
    if (closed) return;
    onStatus && onStatus(tries ? 'reconnecting' : 'connecting');
    ws = new WebSocket(url);
    ws.onopen = () => { ws.send(JSON.stringify(hello())); };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { tries = 0; onStatus && onStatus('ok'); }
      if (m.t === 'fatal') { closed = true; onStatus && onStatus('fatal', m); }
      onMessage(m);
    };
    ws.onclose = () => {
      if (closed) return;
      tries++; onStatus && onStatus('reconnecting');
      timer = setTimeout(open, Math.min(5000, 400 * 2 ** Math.min(tries, 4)));
    };
    ws.onerror = () => {};
  }
  open();
  return {
    send(m) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; },
    close() { closed = true; clearTimeout(timer); if (ws) ws.close(); },
    get ready() { return !!ws && ws.readyState === 1; }
  };
}
