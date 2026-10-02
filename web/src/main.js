// The Vercel version of the game: the same game code as the Laravel app, served as a static page,
// with the Top 10 from /api/scores (api/scores.js) instead of Laravel.
import './app.css';

import { setUpInstallableApp } from '../../resources/js/pwa.js';
import { startSnakeGame } from '../../resources/js/snake/main.js';

const gameRoot = document.getElementById('snake-game');

if (gameRoot) {
    startSnakeGame(gameRoot);
    setUpInstallableApp(document.getElementById('install-button'));
}
