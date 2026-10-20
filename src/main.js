import { Game } from './game.js';
import { GameAudio } from './audio.js';

const audio = new GameAudio();
const game = new Game(document.getElementById('app'), audio);
window.__game = game;

try {
  game.init();
} catch (error) {
  console.error(error);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.innerHTML = '<div style="max-width:520px;padding:24px;text-align:center;font:14px/1.6 system-ui;color:#cfe3f5">'
      + '<div style="font-size:20px;font-weight:800;margin-bottom:10px">3D acceleration unavailable</div>'
      + 'This browser could not create a WebGL context. Try Chrome, Edge, or Safari with hardware acceleration enabled.'
      + '</div>';
  }
}
