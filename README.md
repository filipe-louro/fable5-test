# 🎱 Sinuca Online

Jogo de sinuca (bola 8) para **dois jogadores + espectadores**, direto no
navegador. Um jogador cria uma sala com um código único, envia o link para os
amigos: o primeiro a entrar joga, os demais assistem em tempo real — sem
cadastro, sem backend e sem chave de API.

## Como funciona

- **Site 100% estático** (HTML + CSS + JavaScript puro) — deploy trivial na Vercel.
- **Multiplayer em tempo real via WebRTC** (biblioteca [PeerJS](https://peerjs.com)):
  o servidor público do PeerJS só faz o *handshake* inicial; depois a partida
  trafega direto entre os navegadores (P2P, com o anfitrião como hub).
- **Sala única por ID**: o anfitrião gera um código de 5 caracteres (ex.: `K7PQ2`)
  que identifica a sessão. Os amigos entram pelo código ou pelo link
  `https://seu-projeto.vercel.app/?sala=K7PQ2`. Várias salas podem existir ao
  mesmo tempo — cada código é uma sessão independente (colisões de código são
  regeneradas automaticamente).
- **Espectadores**: quem entrar depois do segundo jogador assiste ao vivo
  (até 8 por sala), com contagem 👁 no topo. Espectadores recebem tudo:
  mira, tacadas quadro a quadro, faltas e placar.
- **Física própria em canvas 2D**: fricção em duas fases (deslizamento →
  rolagem), colisões com leve efeito tangencial, tabelas com fricção no quique
  e caçapas com "queixos" reais — a bola pode rateiar na boca e voltar, ou
  cair naturalmente rolando pela tabela até o canto.
- **Mira e força**: aponte com o cursor (linha de trajetória + bola fantasma),
  pressione e **puxe para trás** para dar força — o taco recua e a barra mostra
  a potência; solte para tacar. Controle fino de qualquer distância.
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
2. Clique em **Copiar link de convite** e envie para os amigos.
3. O primeiro a entrar joga contra você (o anfitrião faz a quebra);
   quem chegar depois assiste como espectador.
4. **Mira e força**: aponte com o cursor para ver a trajetória; pressione e
   puxe para trás para carregar o taco (a barra mostra a força); solte para
   tacar. Soltar sem puxar cancela.
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
~25×/segundo; ao final da jogada envia o estado completo (autoritativo), que
inclui turnos, faltas e placar. Isso evita problemas de sincronização de
física entre navegadores diferentes. O anfitrião atua como hub: retransmite a
partida para os espectadores, que podem entrar a qualquer momento e recebem o
estado atual na chegada.

## Rodando localmente

Qualquer servidor estático funciona:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Abra duas janelas do navegador para testar o multiplayer (ou use o modo local).
