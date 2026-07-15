# 🕹️ Hub de Jogos P2P

Hub de jogos para **dois jogadores + espectadores**, direto no navegador. Crie
uma sala com código único, chame os amigos e escolham juntos: **partida casual**
(um jogo) ou **torneio** (vários jogos com placar de vitórias). Sem cadastro,
sem backend e sem chave de API — 100% estático, pronto para a Vercel.

## Os 10 jogos

| Jogo | Estilo | Como vence |
| --- | --- | --- |
| 🎱 Sinuca | Física por turnos | Bola 8 (regras completas: grupos, faltas, bola na mão) |
| ⚽ Futebol de Botão | Física por turnos | Arremesse os 5 jogadores-círculo; primeiro a 3 gols |
| 🏓 Ping Pong | Tempo real | Primeiro a 7 pontos |
| 🏒 Air Hockey | Tempo real | Primeiro a 5 gols |
| 🎳 Boliche | Física por turnos | 5 frames, strike/spare valem bônus |
| ⛳ Mini-Golf | Física por turnos | 3 buracos, menos tacadas |
| 🪩 Pinball | Física em turnos | 2 bolas cada, maior pontuação |
| 🃏 Poker Hold'em | Cartas (só online) | Heads-up, zere as fichas do rival |
| ⚫ Damas | Tabuleiro | Capture tudo ou trave o rival |
| ❌ Jogo da Velha | Tabuleiro | Três em linha |

## Como funciona

- **Sala primeiro, jogo depois**: o anfitrião cria a sala e, com os dois
  jogadores no lobby, escolhe o modo e o(s) jogo(s). Espectadores podem entrar
  a qualquer momento (inclusive no meio da partida) — quem chega depois do
  segundo jogador assiste automaticamente (até 8 por sala).
- **Modo casual**: um jogo; ao final dá para jogar de novo (com série de
  vitórias) ou voltar ao lobby e trocar de jogo.
- **Modo torneio**: escolha 2+ jogos (a ordem dos cliques define a sequência);
  cada vitória vale 1 ponto no placar; ao final o hub declara o campeão.
- **Salas ativas**: a página inicial lista as salas públicas abertas, com
  filtro por texto (código, anfitrião, jogo) e por situação (com vaga /
  jogando). A listagem também é P2P: o primeiro visitante online vira o
  "diretório" da rede e os anfitriões anunciam suas salas nele (com re-eleição
  automática se ele sair). O anfitrião pode desmarcar a listagem pública.
- **Rede**: WebRTC via [PeerJS](https://peerjs.com) — o broker público só faz o
  handshake; o jogo trafega direto entre os navegadores. O anfitrião é o hub da
  sala: retransmite tudo para os espectadores. Nos jogos por turno, quem joga
  simula a física e transmite; nos de tempo real (ping pong, air hockey), o
  anfitrião é autoritativo. No poker, as cartas fechadas viajam por mensagem
  privada (espectadores não recebem até o showdown).
- Também dá para jogar **em dois no mesmo aparelho** (modo local; poker é a
  única exceção, por ter cartas ocultas).

## Deploy na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e importe este repositório.
2. Framework Preset: **Other** (site estático — sem build, output na raiz).
3. **Deploy**. Não há variáveis de ambiente nem dependências.

## Estrutura do código

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` / `style.css` | Menu, lobby, HUD, overlays de placar |
| `js/main.js` | Hub: sala, lobby, modos, placar de torneio, relay a espectadores |
| `js/net.js` | Transporte P2P multi-conexão (1 jogador + N espectadores) |
| `js/dir.js` | Diretório P2P de salas ativas (eleição + heartbeat + listagem) |
| `js/engine.js` | Física de círculos, mira "pressione e puxe", sons, utilitários |
| `js/physics.js` / `js/rules.js` | Física e regras específicas da sinuca |
| `js/games/*.js` | Um módulo por jogo, com interface comum |

### Interface de um jogo

Cada jogo exporta `{ id, name, icon, desc, local, create(env) }`, e a instância
implementa `start / snapshot / restore / msg / pointer / key / tick / draw`.
O `env` fornece assento, nomes, envio de mensagens (com variante privada),
HUD (mensagem, dica, sublinha por jogador, botões de ação) e `finish(vencedor,
texto)` — o hub cuida do placar, do interstitial e do torneio.

## Rodando localmente

```bash
python3 -m http.server 8000
# ou: npx serve .
```

Abra várias janelas para simular jogadores e espectadores (ou use o modo local).
