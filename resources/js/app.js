import { startSnakeGame } from './snake/main.js';

const gameRoot = document.getElementById('snake-game');

if (gameRoot) {
    startSnakeGame(gameRoot);
}
