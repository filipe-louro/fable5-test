// Registro central dos jogos disponíveis no hub.
import sinuca from './sinuca.js';
import futebol from './futebol.js';
import pingpong from './pingpong.js';
import airhockey from './airhockey.js';
import boliche from './boliche.js';
import golf from './golf.js';
import pinball from './pinball.js';
import poker from './poker.js';
import damas from './damas.js';
import velha from './velha.js';

export const GAMES = [sinuca, futebol, pingpong, airhockey, boliche, golf, pinball, poker, damas, velha];

export const gameById = (id) => GAMES.find((g) => g.id === id) || null;
