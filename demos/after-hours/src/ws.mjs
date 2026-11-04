// Minimal RFC 6455 WebSocket server (text frames only), zero dependencies.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_FRAME = 16 * 1024;

export class WSConn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.buf = Buffer.alloc(0); this.frags = []; this.open = true; this.lastData = Date.now();
    socket.setNoDelay(true);
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    this.ping = setInterval(() => {
      if (Date.now() - this.lastData > 35_000) return this.terminate();
      this.frame(0x9, Buffer.alloc(0));
    }, 15_000);
  }
  get buffered() { return this.socket.writableLength; }
  onData(d) {
    this.lastData = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.open) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const hi = this.buf.readUInt32BE(2); len = this.buf.readUInt32BE(6); off = 10; if (hi) return this.fail(1009); }
      if (!masked) return this.fail(1002);
      if (len > MAX_FRAME) return this.fail(1009);
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4); const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) { this.frame(0x8, Buffer.alloc(0)); return this.terminate(); }
      if (op === 0x9) { this.frame(0xA, data); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        this.frags.push(data);
        const total = this.frags.reduce((s, x) => s + x.length, 0);
        if (total > MAX_FRAME) return this.fail(1009);
        if (fin) { const msg = Buffer.concat(this.frags).toString('utf8'); this.frags = []; this.emit('message', msg); }
        continue;
      }
      return this.fail(1003); // binary or unknown
    }
  }
  frame(op, payload) {
    if (!this.open || this.socket.destroyed) return;
    const n = payload.length; let head;
    if (n < 126) { head = Buffer.from([0x80 | op, n]); }
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(n, 6); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(text) { this.frame(0x1, Buffer.from(text, 'utf8')); }
  fail(code) { const b = Buffer.alloc(2); b.writeUInt16BE(code); this.frame(0x8, b); this.terminate(); }
  close() { this.frame(0x8, Buffer.from([0x03, 0xe8])); setTimeout(() => this.terminate(), 200); }
  terminate() { if (!this.socket.destroyed) this.socket.destroy(); this.finish(); }
  finish() { if (!this.open) return; this.open = false; clearInterval(this.ping); this.emit('close'); }
}

/** Complete the HTTP upgrade. Returns a WSConn, or null if the request was rejected. */
export function acceptUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return null;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  return new WSConn(socket);
}
