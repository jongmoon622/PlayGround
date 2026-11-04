import { Game } from './game.js';

function fail(message) {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.remove('done');
    loading.innerHTML = `
      <div class="loader-mark">!</div>
      <div class="loader-text" style="max-width:340px;line-height:1.7;letter-spacing:.12em">
        THIS ARENA NEEDS WEBGL<br><span style="opacity:.6;font-size:10px">${message}</span>
      </div>`;
  }
}

try {
  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas);
  window.game = game;

  const hideLoading = () => {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('done');
  };
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(hideLoading, 260)));
} catch (error) {
  console.error(error);
  fail(String(error && error.message ? error.message : error));
}
