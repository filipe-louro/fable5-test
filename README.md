# 🎱 Sinuca Online

Jogo de sinuca (bola 8) para **dois jogadores**, direto no navegador. Um jogador
cria uma sala com um código único, envia o link para um amigo e os dois jogam em
tempo real — sem cadastro, sem backend e sem chave de API.

## Como funciona

- **Site 100% estático** (HTML + CSS + JavaScript puro) — deploy trivial na Vercel.
- **Multiplayer em tempo real via WebRTC** (biblioteca [PeerJS](https://peerjs.com)):
  o servidor público do PeerJS só faz o *handshake* inicial; depois a partida
  trafega direto entre os dois navegadores (P2P).
- **Sala única por ID**: o anfitrião gera um código de 5 caracteres (ex.: `K7PQ2`)
  que identifica a sessão. O amigo entra pelo código ou pelo link
  `https://seu-projeto.vercel.app/?sala=K7PQ2`.
- **Física própria em canvas 2D**: colisões, tabelas, caçapas, fricção, mira com
  previsão de trajetória e medidor de força.
- **Regras da bola 8** (simplificadas): quebra, mesa aberta, lisas × listradas,
  faltas (branca na caçapa, não tocar bola, tocar o grupo errado), bola na mão,
  vitória/derrota com a bola 8 e revanche com quebra alternada.
- Também dá para jogar **em dois no mesmo aparelho** (modo local).

## Deploy na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e importe este repositório.
2. Framework Preset: **Other** (site estático — sem comando de build, output na raiz).
3. Clique em **Deploy**. Pronto!

Não há variáveis de ambiente nem dependências para instalar.

## Como jogar

1. Abra o site, digite seu nome e clique em **Criar sala**.
2. Clique em **Copiar link de convite** e envie para seu amigo.
3. Quando ele entrar, a partida começa — o anfitrião faz a quebra.
4. **Mira**: arraste a partir da bola branca; quanto mais longe o dedo/cursor,
   mais força (o anel ao redor da branca mostra a potência). Solte para tacar.
5. **Bola na mão** (após falta): toque em qualquer ponto livre da mesa para
   posicionar a branca.

## Estrutura do código

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Estrutura da página, menus e HUD |
| `style.css` | Visual (tema escuro, responsivo, mobile-friendly) |
| `js/physics.js` | Simulação física: colisões, tabelas, caçapas, previsão de mira |
| `js/rules.js` | Regras da bola 8: grupos, faltas, turnos, fim de jogo |
| `js/net.js` | Salas e transporte P2P (PeerJS/WebRTC) |
| `js/main.js` | Renderização em canvas, entrada (mouse/touch), HUD, sons e orquestração |

### Modelo de rede

Quem está na vez simula a tacada localmente e transmite a posição das bolas
~25×/segundo para o adversário; ao final da jogada envia o estado completo
(autoritativo), que inclui turnos, faltas e placar. Isso evita problemas de
sincronização de física entre navegadores diferentes.

## Rodando localmente

Qualquer servidor estático funciona:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Abra duas janelas do navegador para testar o multiplayer (ou use o modo local).
