// Conexão P2P via PeerJS (WebRTC). A sala é identificada por um código curto:
// o anfitrião registra o peer-id "sinuca8-CODIGO" e os demais conectam nele.
// O anfitrião aceita várias conexões (1 jogador + espectadores) e atua como
// hub; convidado/espectador mantém uma única conexão com o anfitrião.
// O broker público do PeerJS só faz o handshake; o jogo trafega direto.

const PREFIX = 'sinuca8-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I

export function makeRoomCode() {
  let code = '';
  const rand = new Uint32Array(5);
  crypto.getRandomValues(rand);
  for (const r of rand) code += CODE_CHARS[r % CODE_CHARS.length];
  return code;
}

export class Net {
  // callbacks:
  //   onMessage(msg, connId)  – mensagem recebida (connId só no anfitrião)
  //   onOpen(connId)          – conexão pronta
  //   onConnClose(connId)     – uma conexão caiu (anfitrião) / a conexão caiu (convidado)
  //   onStatus(kind, text)    – progresso/erros para a UI
  //   onCodeChange(code)      – anfitrião trocou o código (colisão de id)
  constructor({ onMessage, onOpen, onConnClose, onStatus, onCodeChange }) {
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onConnClose = onConnClose;
    this.onStatus = onStatus;
    this.onCodeChange = onCodeChange || (() => {});
    this.peer = null;
    this.conns = new Map(); // connId -> DataConnection
    this.isHost = false;
    this.code = '';
    this._nextId = 1;
    this._hostRetries = 0;
    this._closed = false;
  }

  _ensurePeerJs() {
    if (typeof Peer === 'undefined') {
      this.onStatus('error', 'Não foi possível carregar a biblioteca de conexão. Verifique sua internet.');
      return false;
    }
    return true;
  }

  host(code) {
    if (!this._ensurePeerJs()) return;
    this.isHost = true;
    this.code = code;
    this.onStatus('waiting', 'Criando sala…');
    this.peer = new Peer(PREFIX + code, { debug: 1 });
    this.peer.on('open', () => {
      this.onStatus('waiting', 'Sala criada. Aguardando jogadores…');
    });
    this.peer.on('connection', (conn) => this._wire(conn));
    this.peer.on('error', (err) => this._peerError(err));
  }

  join(code) {
    if (!this._ensurePeerJs()) return;
    this.isHost = false;
    this.code = code;
    this.onStatus('waiting', 'Conectando à sala…');
    this.peer = new Peer({ debug: 1 });
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true });
      this._wire(conn);
    });
    this.peer.on('error', (err) => this._peerError(err));
  }

  _wire(conn) {
    const id = this._nextId++;
    conn.on('open', () => {
      this.conns.set(id, conn);
      this.onStatus('connected', 'Conectado!');
      this.onOpen(id);
    });
    conn.on('data', (data) => {
      try {
        this.onMessage(data, id);
      } catch (e) {
        console.error('Erro ao processar mensagem', e, data);
      }
    });
    const drop = () => {
      if (this.conns.delete(id)) this.onConnClose(id);
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  _peerError(err) {
    console.error('peer error', err);
    if (this._closed) return;
    if (err.type === 'unavailable-id' && this.isHost && this._hostRetries < 3) {
      // código já em uso em outra sala — gera outro automaticamente
      this._hostRetries++;
      const fresh = makeRoomCode();
      try {
        this.peer.destroy();
      } catch (_) { /* ignore */ }
      this.onCodeChange(fresh);
      this.host(fresh);
      return;
    }
    if (err.type === 'peer-unavailable') {
      this.onStatus('error', 'Sala não encontrada. Confira o código e tente de novo.');
    } else if (err.type === 'unavailable-id') {
      this.onStatus('error', 'Não foi possível registrar a sala. Tente novamente.');
    } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
      this.onStatus('error', 'Falha de conexão com o servidor de pareamento. Tente novamente.');
    } else {
      this.onStatus('error', 'Erro de conexão (' + err.type + ').');
    }
  }

  get connected() {
    return this.conns.size > 0;
  }

  // Envia para todos (anfitrião) ou para o anfitrião (convidado/espectador).
  send(obj) {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(obj);
    }
  }

  sendTo(connId, obj) {
    const conn = this.conns.get(connId);
    if (conn && conn.open) conn.send(obj);
  }

  sendExcept(connId, obj) {
    for (const [id, conn] of this.conns) {
      if (id !== connId && conn.open) conn.send(obj);
    }
  }

  closeConn(connId) {
    const conn = this.conns.get(connId);
    this.conns.delete(connId);
    try {
      if (conn) conn.close();
    } catch (_) { /* ignore */ }
  }

  close() {
    this._closed = true;
    try {
      for (const conn of this.conns.values()) conn.close();
      if (this.peer) this.peer.destroy();
    } catch (_) { /* ignore */ }
    this.conns.clear();
    this.peer = null;
  }
}
