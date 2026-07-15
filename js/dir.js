// Diretório de salas ativas, 100% P2P: o primeiro visitante que conseguir
// registrar o peer-id fixo DIR_ID vira o "diretório" e mantém a lista de
// salas em memória; os demais conectam nele para anunciar/listar. Se o
// diretório sair, outro visitante assume na próxima tentativa (re-eleição
// com backoff). É melhor-esforço: sem ninguém online, não há lista — mas
// também não há salas para listar.

const DIR_ID = 'gamehub25-dir-v1';
const STALE_MS = 14000;

export class Directory {
  constructor() {
    this.peer = null; // meu peer (quando sou o diretório)
    this.conn = null; // conexão-cliente com o diretório
    this.isDirectory = false;
    this.rooms = new Map(); // code -> {info, seen} (apenas quando diretório)
    this.pendingList = [];
    this.myAnnounce = null; // info da minha sala (re-anunciada ao reconectar)
    this._destroyed = false;
    this._connecting = false;
    this._prune = setInterval(() => this._pruneStale(), 5000);
    this._heartbeat = setInterval(() => {
      if (this.myAnnounce) this.announce(this.myAnnounce);
    }, 4000);
  }

  destroy() {
    this._destroyed = true;
    clearInterval(this._prune);
    clearInterval(this._heartbeat);
    try {
      if (this.conn) this.conn.close();
      if (this.peer) this.peer.destroy();
    } catch (_) { /* ignore */ }
    this.conn = null;
    this.peer = null;
  }

  _pruneStale() {
    if (!this.isDirectory) return;
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (now - r.seen > STALE_MS) this.rooms.delete(code);
    }
  }

  // Garante um caminho até o diretório (virando ele ou conectando).
  _ensure() {
    if (this._destroyed || typeof Peer === 'undefined') return;
    if (this.isDirectory || this._connecting) return;
    if (this.conn && this.conn.open) return;
    this._connecting = true;
    const p = new Peer(DIR_ID, { debug: 0 });
    let settled = false;
    p.on('open', () => {
      if (settled) return;
      settled = true;
      this._connecting = false;
      this.isDirectory = true;
      this.peer = p;
      p.on('connection', (c) => this._serve(c));
      this._flush();
    });
    p.on('error', (err) => {
      if (settled && err.type !== 'unavailable-id') return;
      if (err.type === 'unavailable-id') {
        settled = true;
        try { p.destroy(); } catch (_) { /* ignore */ }
        this._connectAsClient();
      } else if (!settled) {
        settled = true;
        this._connecting = false;
        try { p.destroy(); } catch (_) { /* ignore */ }
        this._failPending('Serviço de listagem indisponível no momento.');
      }
    });
  }

  _connectAsClient() {
    const p = new Peer({ debug: 0 });
    this.peer = null;
    p.on('open', () => {
      const conn = p.connect(DIR_ID, { reliable: true });
      conn.on('open', () => {
        this._connecting = false;
        this.conn = conn;
        this._clientPeer = p;
        if (this.myAnnounce) conn.send({ t: 'reg', info: this.myAnnounce });
        this._flush();
      });
      conn.on('data', (m) => {
        if (m && m.t === 'rooms') {
          const cbs = this.pendingList.splice(0);
          for (const cb of cbs) cb(m.rooms, null);
        }
      });
      const drop = () => {
        if (this.conn === conn) this.conn = null;
        this._connecting = false;
        try { p.destroy(); } catch (_) { /* ignore */ }
        // re-eleição com atraso aleatório
        if (!this._destroyed && (this.myAnnounce || this.pendingList.length)) {
          setTimeout(() => this._ensure(), 400 + Math.random() * 1200);
        }
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    p.on('error', () => {
      this._connecting = false;
      try { p.destroy(); } catch (_) { /* ignore */ }
      this._failPending('Serviço de listagem indisponível no momento.');
    });
  }

  _failPending(msg) {
    const cbs = this.pendingList.splice(0);
    for (const cb of cbs) cb(null, msg);
  }

  _flush() {
    if (this.pendingList.length) this._requestList();
  }

  // lado servidor (quando sou o diretório)
  _serve(conn) {
    conn.on('data', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'reg' && m.info && typeof m.info.code === 'string') {
        this.rooms.set(m.info.code.slice(0, 8), { info: sanitize(m.info), seen: Date.now() });
      } else if (m.t === 'unreg' && typeof m.code === 'string') {
        this.rooms.delete(m.code);
      } else if (m.t === 'list') {
        conn.send({ t: 'rooms', rooms: this._list() });
      }
    });
  }

  _list() {
    this._pruneStale();
    return [...this.rooms.values()].map((r) => r.info);
  }

  announce(info) {
    this.myAnnounce = sanitize(info);
    if (this.isDirectory) {
      this.rooms.set(this.myAnnounce.code, { info: this.myAnnounce, seen: Date.now() });
    } else if (this.conn && this.conn.open) {
      this.conn.send({ t: 'reg', info: this.myAnnounce });
    } else {
      this._ensure();
    }
  }

  unannounce() {
    const code = this.myAnnounce && this.myAnnounce.code;
    this.myAnnounce = null;
    if (!code) return;
    if (this.isDirectory) this.rooms.delete(code);
    else if (this.conn && this.conn.open) this.conn.send({ t: 'unreg', code });
  }

  // list(cb): cb(rooms[]|null, errText|null)
  list(cb) {
    if (this.isDirectory) {
      cb(this._list(), null);
      return;
    }
    this.pendingList.push(cb);
    if (this.conn && this.conn.open) this._requestList();
    else this._ensure();
    setTimeout(() => {
      const i = this.pendingList.indexOf(cb);
      if (i >= 0) {
        this.pendingList.splice(i, 1);
        cb(null, 'Sem resposta do serviço de listagem.');
      }
    }, 6000);
  }

  _requestList() {
    if (this.conn && this.conn.open) this.conn.send({ t: 'list' });
  }
}

function sanitize(info) {
  return {
    code: String(info.code || '').slice(0, 8),
    host: String(info.host || '').slice(0, 14),
    mode: info.mode === 'torneio' ? 'torneio' : 'casual',
    game: String(info.game || '').slice(0, 40),
    players: Math.min(2, Math.max(1, info.players | 0)),
    spec: Math.max(0, info.spec | 0),
    status: info.status === 'playing' ? 'playing' : 'lobby',
  };
}
