// Registro central dos jogos disponíveis no hub arcade.
import sinuca from './sinuca.js';
import cobrinha from './cobrinha.js';
import tanques from './tanques.js';
import airhockey from './airhockey.js';
import pingpong from './pingpong.js';
import futebol from './futebol.js';
import boliche from './boliche.js';
import golf from './golf.js';
import pinball from './pinball.js';
import poker from './poker.js';

export const GAMES = [
  sinuca,
  cobrinha,
  tanques,
  airhockey,
  pingpong,
  futebol,
  boliche,
  golf,
  pinball,
  poker,
];

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
