// Conexão P2P via PeerJS (WebRTC). A sala é identificada por um código curto:
// o anfitrião registra o peer-id "sinuca8-CODIGO" e o convidado conecta nele.
// Usa o broker público gratuito do PeerJS apenas para o handshake; o jogo
// trafega direto entre os dois navegadores.

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
  constructor({ onMessage, onOpen, onClose, onStatus }) {
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onStatus = onStatus;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
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
    this.onStatus('waiting', 'Criando sala…');
    this.peer = new Peer(PREFIX + code, { debug: 1 });
    this.peer.on('open', () => {
      this.onStatus('waiting', 'Sala criada. Aguardando seu amigo entrar…');
    });
    this.peer.on('connection', (conn) => {
      if (this.conn) {
        conn.close(); // sala cheia
        return;
      }
      this._wire(conn);
    });
    this.peer.on('error', (err) => this._peerError(err));
  }

  join(code) {
    if (!this._ensurePeerJs()) return;
    this.isHost = false;
    this.onStatus('waiting', 'Conectando à sala…');
    this.peer = new Peer({ debug: 1 });
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true });
      this._wire(conn);
    });
    this.peer.on('error', (err) => this._peerError(err));
  }

  _wire(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.onStatus('connected', 'Conectado!');
      this.onOpen();
    });
    conn.on('data', (data) => {
      try {
        this.onMessage(data);
      } catch (e) {
        console.error('Erro ao processar mensagem', e, data);
      }
    });
    conn.on('close', () => {
      this.conn = null;
      this.onClose();
    });
    conn.on('error', () => {
      this.conn = null;
      this.onClose();
    });
  }

  _peerError(err) {
    console.error('peer error', err);
    if (err.type === 'peer-unavailable') {
      this.onStatus('error', 'Sala não encontrada. Confira o código e tente de novo.');
    } else if (err.type === 'unavailable-id') {
      this.onStatus('error', 'Esse código já está em uso. Crie a sala novamente.');
    } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
      this.onStatus('error', 'Falha de conexão com o servidor de pareamento. Tente novamente.');
    } else {
      this.onStatus('error', 'Erro de conexão (' + err.type + ').');
    }
  }

  get connected() {
    return !!this.conn && this.conn.open;
  }

  send(obj) {
    if (this.connected) this.conn.send(obj);
  }

  close() {
    try {
      if (this.conn) this.conn.close();
      if (this.peer) this.peer.destroy();
    } catch (_) {
      /* ignore */
    }
    this.conn = null;
    this.peer = null;
  }
}
