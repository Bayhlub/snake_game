import { BOTS, COLS, DIRECTIONS, ROWS } from './config.js';
import { createRenderer } from './renderer.js';
import { createSound } from './sound.js';
import { directionToward } from './steering.js';
import { createWorld, getPlayer, isReverse, step, tickDuration } from './world.js';

const KEY_DIRECTIONS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
};
const MAX_QUEUED_TURNS = 3;

const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch {
            // Storage can be blocked (private mode); the game still works without it.
        }
    },
};

export function startSnakeGame(root) {
    const $ = (selector) => root.querySelector(selector);
    const elements = {
        canvas: $('#game-board'),
        score: $('#hud-score'),
        length: $('#hud-length'),
        best: $('#hud-best'),
        bots: $('#hud-bots'),
        message: $('#event-message'),
        overlays: {
            ready: $('#overlay-start'),
            paused: $('#overlay-pause'),
            over: $('#overlay-over'),
        },
        deathCause: $('#death-cause'),
        finalScore: $('#final-score'),
        finalLength: $('#final-length'),
        newBest: $('#new-best'),
        saveForm: $('#save-form'),
        playerName: $('#player-name'),
        saveButton: $('#save-button'),
        saveStatus: $('#save-status'),
        leaderboard: $('#leaderboard'),
        leaderboardEmpty: $('#leaderboard-empty'),
        leaderboardRow: $('#leaderboard-row'),
        soundToggle: $('#sound-toggle'),
    };

    const renderer = createRenderer(elements.canvas, COLS, ROWS);
    const sound = createSound(storage.get('snake.muted') === '1');

    let world = createWorld();
    let state = 'ready';
    let turnQueue = [];
    let pointerTarget = null;
    let accumulated = 0;
    let lastFrame = performance.now();
    let best = Number(storage.get('snake.best')) || 0;
    let messageTimer = null;

    elements.playerName.value = storage.get('snake.name') ?? '';
    renderLeaderboard(JSON.parse($('#leaderboard-data').textContent));
    updateSoundToggle();
    updateHud();
    showOverlay('ready');

    function newGame() {
        world = createWorld();
        turnQueue = [];
        pointerTarget = null;
        accumulated = 0;
        state = 'playing';
        showOverlay(null);
        updateHud();
        document.activeElement?.blur();
    }

    function setPaused(paused) {
        if (paused && state === 'playing') {
            state = 'paused';
            showOverlay('paused');
        } else if (!paused && state === 'paused') {
            state = 'playing';
            lastFrame = performance.now();
            showOverlay(null);
            document.activeElement?.blur();
        }
    }

    function queueTurn(name) {
        pointerTarget = null;
        if (state === 'ready') {
            newGame();
        }
        if (state !== 'playing') {
            return;
        }

        const direction = DIRECTIONS[name];
        const previous = turnQueue.at(-1) ?? getPlayer(world).dir;
        if (direction === previous || isReverse(direction, previous) || turnQueue.length >= MAX_QUEUED_TURNS) {
            return;
        }
        turnQueue.push(direction);
    }

    function frame(now) {
        const elapsed = Math.min(now - lastFrame, 250);
        lastFrame = now;

        if (state === 'playing') {
            accumulated += elapsed;
            let duration = tickDuration(world);

            while (accumulated >= duration && state === 'playing') {
                accumulated -= duration;
                const turn = turnQueue.shift() ?? (pointerTarget && directionToward(getPlayer(world), pointerTarget, world));
                handleEvents(step(world, turn, duration), duration - accumulated);
                updateHud();

                if (world.over) {
                    gameOver();
                }
                duration = tickDuration(world);
            }
        }

        const isMoving = state === 'playing' || state === 'paused';
        renderer.draw(world, now, isMoving ? Math.min(accumulated / tickDuration(world), 1) : 1, state === 'playing' ? pointerTarget : null);
        requestAnimationFrame(frame);
    }

    function handleEvents(events, effectDelayMs) {
        for (const event of events) {
            renderer.showEvent(event, effectDelayMs);

            if (event.type === 'eat' && event.snake.isPlayer) {
                sound.eat();
            } else if (event.type === 'fruit' && event.snake.isPlayer) {
                sound.fruit();
            } else if (event.type === 'botDied') {
                sound.botDied();
                showMessage(describeBotCrash(event.snake, event.cause));
            } else if (event.type === 'playerDied') {
                sound.playerDied();
            }
        }
    }

    function gameOver() {
        state = 'over';
        const player = getPlayer(world);
        const isNewBest = world.points > best;
        if (isNewBest) {
            best = world.points;
            storage.set('snake.best', String(best));
        }

        elements.deathCause.textContent = describePlayerCrash(world.deathCause);
        elements.finalScore.textContent = world.points;
        elements.finalLength.textContent = player.body.length;
        elements.newBest.hidden = !isNewBest;
        elements.saveForm.hidden = world.points === 0;
        elements.saveButton.disabled = false;
        elements.saveStatus.textContent = '';
        updateHud();
        showOverlay('over');
    }

    async function saveScore(event) {
        event.preventDefault();
        const name = elements.playerName.value.trim();
        if (!name) {
            elements.saveStatus.textContent = 'Please type your name first.';
            elements.playerName.focus();
            return;
        }

        storage.set('snake.name', name);
        elements.saveButton.disabled = true;
        elements.saveStatus.textContent = 'Saving…';

        try {
            const body = JSON.stringify({
                player_name: name,
                points: world.points,
                length: getPlayer(world).body.length,
            });
            let response = await postScore(body);
            if (response.status === 419) {
                // The installed app may have opened a cached page whose session token has expired.
                await refreshCsrfToken();
                response = await postScore(body);
            }
            const data = await response.json();

            if (!response.ok) {
                const firstError = data.errors ? Object.values(data.errors)[0][0] : null;
                elements.saveStatus.textContent =
                    response.status === 429 ? 'Too many saves. Wait a minute and try again.' : (firstError ?? 'Could not save your score.');
                elements.saveButton.disabled = false;
                return;
            }

            elements.saveStatus.textContent = `Saved! You are #${data.rank} on the leaderboard.`;
            renderLeaderboard(data.leaderboard);
            elements.saveButton.blur();
        } catch {
            elements.saveStatus.textContent = 'Could not reach the server. Try again.';
            elements.saveButton.disabled = false;
        }
    }

    function postScore(body) {
        return fetch(elements.saveForm.action, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfMeta().content,
            },
            body,
        });
    }

    async function refreshCsrfToken() {
        const html = await (await fetch('/', { cache: 'no-store' })).text();
        const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('meta[name="csrf-token"]');
        if (fresh) {
            csrfMeta().content = fresh.content;
        }
    }

    function csrfMeta() {
        return document.querySelector('meta[name="csrf-token"]');
    }

    function renderLeaderboard(scores) {
        elements.leaderboard.replaceChildren(
            ...scores.map((score, i) => {
                const row = elements.leaderboardRow.content.cloneNode(true);
                row.querySelector('[data-rank]').textContent = i + 1;
                row.querySelector('[data-name]').textContent = score.player_name;
                row.querySelector('[data-points]').textContent = score.points;
                return row;
            }),
        );
        elements.leaderboardEmpty.hidden = scores.length > 0;
    }

    function updateHud() {
        elements.score.textContent = world.points;
        elements.length.textContent = getPlayer(world).body.length;
        elements.best.textContent = Math.max(best, world.points);
        elements.bots.textContent = `${world.snakes.filter((snake) => !snake.isPlayer && snake.alive).length}/${BOTS.length}`;
    }

    function showOverlay(name) {
        for (const [key, overlay] of Object.entries(elements.overlays)) {
            overlay.hidden = key !== name;
        }
    }

    function showMessage(text) {
        elements.message.textContent = text;
        elements.message.classList.remove('opacity-0');
        clearTimeout(messageTimer);
        messageTimer = setTimeout(() => elements.message.classList.add('opacity-0'), 1500);
    }

    function toggleSound() {
        sound.toggle();
        storage.set('snake.muted', sound.muted ? '1' : '0');
        updateSoundToggle();
    }

    function updateSoundToggle() {
        elements.soundToggle.textContent = sound.muted ? '🔇 Sound off' : '🔊 Sound on';
        elements.soundToggle.setAttribute('aria-pressed', String(!sound.muted));
    }

    document.addEventListener('keydown', (event) => {
        if (event.target.closest('input, textarea, button, a')) {
            return;
        }

        const directionName = KEY_DIRECTIONS[event.key] ?? KEY_DIRECTIONS[event.key.toLowerCase()];
        if (directionName) {
            event.preventDefault();
            queueTurn(directionName);
            return;
        }

        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            if (state === 'ready' || state === 'over') {
                newGame();
            } else if (state === 'paused') {
                setPaused(false);
            }
        } else if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
            setPaused(state === 'playing');
        } else if (event.key === 'm' || event.key === 'M') {
            toggleSound();
        }
    });

    /**
     * Mouse: the snake follows the pointer while it is over the board.
     * Touch: the snake follows the finger while it is down, then keeps going straight.
     */
    function pointerCell(event) {
        const rect = elements.canvas.getBoundingClientRect();
        return {
            x: Math.min(COLS - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * COLS))),
            y: Math.min(ROWS - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * ROWS))),
        };
    }

    elements.canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse') {
            elements.canvas.setPointerCapture(event.pointerId);
        }
        pointerTarget = pointerCell(event);
    });
    elements.canvas.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'mouse' || elements.canvas.hasPointerCapture(event.pointerId)) {
            pointerTarget = pointerCell(event);
        }
    });
    for (const type of ['pointerup', 'pointercancel']) {
        elements.canvas.addEventListener(type, (event) => {
            if (event.pointerType !== 'mouse') {
                pointerTarget = null;
            }
        });
    }

    root.querySelectorAll('[data-direction]').forEach((button) => {
        button.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            queueTurn(button.dataset.direction);
        });
    });

    $('#start-button').addEventListener('click', newGame);
    $('#resume-button').addEventListener('click', () => setPaused(false));
    $('#play-again-button').addEventListener('click', newGame);
    elements.saveForm.addEventListener('submit', saveScore);
    elements.soundToggle.addEventListener('click', () => {
        toggleSound();
        elements.soundToggle.blur();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            setPaused(true);
        }
    });

    requestAnimationFrame(frame);
}

function describePlayerCrash(cause) {
    if (cause.type === 'wall') {
        return 'You hit the wall.';
    }
    if (cause.type === 'headOn') {
        return `Head-on crash with ${cause.other.name}!`;
    }
    return `You ran into ${cause.other.name}.`;
}

function describeBotCrash(bot, cause) {
    if (cause.type === 'wall') {
        return `${bot.name} hit the wall`;
    }
    if (cause.type === 'headOn') {
        return `${bot.name} crashed head-on with ${cause.other.isPlayer ? 'you' : cause.other.name}`;
    }
    return `${bot.name} ran into ${cause.other.isPlayer ? 'you!' : cause.other.name}`;
}
