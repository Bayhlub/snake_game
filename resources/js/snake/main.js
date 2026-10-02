import { BOTS, COLS, DIRECTIONS, MULTIPLAYER_PORT, ROWS } from './config.js';
import { describeBotCrash, describePlayerCrash, pickLanguage, translator } from './i18n.js';
import { connectOnline } from './online.js';
import { createRenderer } from './renderer.js';
import { createSound } from './sound.js';
import { directionToward } from './steering.js';
import { activePowerUps, createWorld, getPlayer, isReverse, step, tickDuration } from './world.js';

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

/**
 * The web game. Solo, the whole game runs here; online, the multiplayer server runs it and this
 * page draws what the server sends and passes the player's turns back.
 */
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
            join: $('#overlay-join'),
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
        powerUps: $('#power-ups'),
        powerUpChip: $('#power-up-chip'),
        languageButtons: root.querySelectorAll('[data-language]'),
        joinForm: $('#join-form'),
        joinName: $('#join-name'),
        joinButton: $('#join-button'),
        joinStatus: $('#join-status'),
        leaveOnline: $('#leave-online'),
        onlinePanel: $('#online-panel'),
        onlinePlayers: $('#online-players'),
        onlinePlayerRow: $('#online-player-row'),
    };

    let language = pickLanguage(storage.get('snake.lang'), navigator.languages ?? [navigator.language]);
    let t = translator(language);

    const renderer = createRenderer(elements.canvas, COLS, ROWS, {
        label: (powerUp) => t(`powerUp.${powerUp.type}`),
        youLabel: () => t('youTag'),
    });
    const sound = createSound(storage.get('snake.muted') === '1');

    let world = createWorld();
    let state = 'ready';
    let turnQueue = [];
    let pointerTarget = null;
    let accumulated = 0;
    let lastFrame = performance.now();
    let best = Number(storage.get('snake.best')) || 0;
    let messageTimer = null;
    /** The save form's status as a translation key, so it can be re-shown in another language. */
    let saveStatus = null;
    /** The finished game shown on the game-over screen: { points, length, cause }. */
    let result = null;
    /** While playing online: { connection, world, lastStateAt }. */
    let online = null;

    /** The world on screen, and the snake this device controls. */
    const shownWorld = () => online?.world ?? world;
    const me = () => (online ? online.world.me() : getPlayer(world));

    elements.playerName.value = storage.get('snake.name') ?? '';
    elements.joinName.value = elements.playerName.value;
    loadLeaderboard();
    applyLanguage();
    updateHud();
    showOverlay('ready');

    function newGame() {
        if (online) {
            online.connection.send({ type: 'respawn' });
            pointerTarget = null;
            state = 'playing';
            showOverlay(null);
            document.activeElement?.blur();
            return;
        }
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
        if (online) {
            return;
        }
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
        if (online) {
            if (state === 'playing') {
                online.connection.send({ type: 'turn', dir: name });
            }
            return;
        }
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

        if (online) {
            const progress = Math.min((now - online.lastStateAt) / online.world.tickMs, 1);
            renderer.draw(online.world, now, progress, state === 'playing' ? pointerTarget : null);
            requestAnimationFrame(frame);
            return;
        }

        if (state === 'playing') {
            accumulated += elapsed;
            let duration = tickDuration(world);

            while (accumulated >= duration && state === 'playing') {
                accumulated -= duration;
                const turn = turnQueue.shift() ?? (pointerTarget && directionToward(getPlayer(world), pointerTarget, world));
                handleEvents(step(world, turn, duration), duration - accumulated);
                updateHud();

                if (world.over) {
                    const player = getPlayer(world);
                    gameOver({ points: world.points, length: player.body.length, cause: world.deathCause });
                }
                duration = tickDuration(world);
            }
        }

        const isMoving = state === 'playing' || state === 'paused';
        renderer.draw(world, now, isMoving ? Math.min(accumulated / tickDuration(world), 1) : 1, state === 'playing' ? pointerTarget : null);
        requestAnimationFrame(frame);
    }

    function handleEvents(events, effectDelayMs) {
        const player = me();
        for (const event of events) {
            renderer.showEvent(event, effectDelayMs);
            const isMine = event.snake && event.snake === player;

            if (event.type === 'eat' && isMine) {
                sound.eat();
            } else if (event.type === 'fruit' && isMine) {
                sound.fruit();
            } else if (event.type === 'botDied' || (event.type === 'playerDied' && !isMine)) {
                sound.botDied();
                showMessage(describeBotCrash(t, event.snake, event.cause, player));
            } else if (event.type === 'playerDied') {
                sound.playerDied();
            } else if (event.type === 'powerUp' && isMine) {
                sound.powerUp();
                showMessage(t('powerUpGot', { emoji: event.powerUp.emoji, label: t(`powerUp.${event.powerUp.type}`) }));
            } else if (event.type === 'shieldBroke' && isMine) {
                sound.shieldBroke();
                showMessage(t('shieldSaved'));
            } else if (event.type === 'powerUpEnded' && isMine) {
                sound.powerUpEnded();
                showMessage(t('powerUpEnded', { label: t(`powerUp.${event.powerUp.type}`) }));
            }
        }
    }

    function gameOver(finished) {
        state = 'over';
        result = finished;
        const isNewBest = finished.points > best;
        if (isNewBest) {
            best = finished.points;
            storage.set('snake.best', String(best));
        }

        elements.deathCause.textContent = describePlayerCrash(t, finished.cause);
        elements.finalScore.textContent = finished.points;
        elements.finalLength.textContent = finished.length;
        elements.newBest.hidden = !isNewBest;
        elements.saveForm.hidden = finished.points === 0;
        elements.saveButton.disabled = false;
        setSaveStatus(null);
        updateHud();
        showOverlay('over');
    }

    /**
     * Online: join the game server on the computer this page came from.
     */
    function joinOnline(event) {
        event.preventDefault();
        const name = elements.joinName.value.trim();
        if (!name) {
            elements.joinStatus.textContent = t('typeName');
            elements.joinName.focus();
            return;
        }
        storage.set('snake.name', name);
        elements.playerName.value = name;
        elements.joinButton.disabled = true;
        elements.joinStatus.textContent = t('connecting');
        // A free hosted server sleeps when nobody plays; say so if waking it takes a while.
        const slowNotice = setTimeout(() => {
            if (!online) {
                elements.joinStatus.textContent = t('wakingUp');
            }
        }, 4000);

        const connection = connectOnline(multiplayerUrl(), name, {
            onJoined(remote) {
                clearTimeout(slowNotice);
                online = { connection, world: remote, lastStateAt: performance.now(), lastLength: remote.me().body.length };
                state = 'playing';
                pointerTarget = null;
                elements.joinButton.disabled = false;
                elements.joinStatus.textContent = '';
                elements.leaveOnline.hidden = false;
                elements.onlinePanel.hidden = false;
                showOverlay(null);
                document.activeElement?.blur();
            },
            onState(remote, events) {
                online.lastStateAt = performance.now();
                handleEvents(events, remote.tickMs);
                const player = remote.me();
                const myCrash = events.find((e) => e.type === 'playerDied' && e.snake === player);
                if (myCrash && state === 'playing') {
                    // The server clears a crashed snake's body, so use its length from the move before.
                    gameOver({ points: player.points, length: online.lastLength, cause: myCrash.cause });
                }
                if (player?.alive) {
                    online.lastLength = player.body.length;
                }
                if (state === 'playing' && pointerTarget && player?.alive) {
                    const turn = directionToward(player, pointerTarget, remote);
                    if (turn) {
                        online.connection.send({ type: 'turn', dir: Object.keys(DIRECTIONS).find((key) => DIRECTIONS[key] === turn) });
                    }
                }
                updateHud();
                renderOnlinePlayers();
            },
            onFailed(reason) {
                clearTimeout(slowNotice);
                elements.joinButton.disabled = false;
                elements.joinStatus.textContent = t(reason === 'full' ? 'serverFull' : 'serverOffline');
            },
            onClosed() {
                leaveOnline();
                showMessage(t('disconnected'));
            },
        });
    }

    /**
     * The game server set in the page (`<meta name="multiplayer-url">`, e.g. the hosted one),
     * otherwise the one running on the computer this page came from.
     */
    function multiplayerUrl() {
        const configured = document.querySelector('meta[name="multiplayer-url"]')?.content?.trim();
        if (configured && !configured.startsWith('%')) {
            return configured;
        }
        return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${MULTIPLAYER_PORT}`;
    }

    function leaveOnline() {
        online?.connection.leave();
        online = null;
        world = createWorld();
        state = 'ready';
        result = null;
        elements.leaveOnline.hidden = true;
        elements.onlinePanel.hidden = true;
        updateHud();
        showOverlay('ready');
    }

    /** Everyone in the online game, best score first. */
    function renderOnlinePlayers() {
        const player = me();
        const players = online.world.snakes.filter((snake) => snake.isPlayer).sort((a, b) => b.points - a.points);
        elements.onlinePlayers.replaceChildren(
            ...players.map((snake) => {
                const row = elements.onlinePlayerRow.content.cloneNode(true);
                row.querySelector('[data-dot]').style.backgroundColor = snake.color;
                row.querySelector('[data-name]').textContent = snake === player ? `${snake.name} (${t('you')})` : snake.name;
                row.querySelector('[data-points]').textContent = snake.alive ? snake.points : '💥';
                return row;
            }),
        );
    }

    async function saveScore(event) {
        event.preventDefault();
        const name = elements.playerName.value.trim();
        if (!name) {
            setSaveStatus('typeName');
            elements.playerName.focus();
            return;
        }

        storage.set('snake.name', name);
        elements.saveButton.disabled = true;
        setSaveStatus('saving');

        try {
            const body = JSON.stringify({ player_name: name, points: result.points, length: Math.max(1, result.length) });
            let response = await postScore(body);
            if (response.status === 419 && csrfMeta()) {
                // The installed app may have opened a cached page whose session token has expired.
                await refreshCsrfToken();
                response = await postScore(body);
            }
            const data = await response.json();

            if (!response.ok) {
                const isNameProblem = Boolean(data.errors?.player_name);
                setSaveStatus(response.status === 429 ? 'tooManySaves' : isNameProblem ? 'nameInvalid' : 'saveFailed');
                elements.saveButton.disabled = false;
                return;
            }

            setSaveStatus('saved', { rank: data.rank });
            renderLeaderboard(data.leaderboard);
            elements.saveButton.blur();
        } catch {
            setSaveStatus('noServer');
            elements.saveButton.disabled = false;
        }
    }

    function setSaveStatus(key, params = {}) {
        saveStatus = key ? { key, params } : null;
        elements.saveStatus.textContent = saveStatus ? t(key, params) : '';
    }

    /**
     * Save a score to the form's endpoint: Laravel's /scores (with its CSRF token) or, on the
     * static Vercel site, /api/scores (no token needed).
     */
    function postScore(body) {
        return fetch(elements.saveForm.action, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(csrfMeta() ? { 'X-CSRF-TOKEN': csrfMeta().content } : {}),
            },
            body,
        });
    }

    /**
     * Laravel puts the Top 10 in the page; the static site fetches it from its API instead.
     */
    async function loadLeaderboard() {
        const embedded = $('#leaderboard-data');
        if (embedded) {
            renderLeaderboard(JSON.parse(embedded.textContent));
            return;
        }
        renderLeaderboard([]);
        try {
            const response = await fetch(elements.saveForm.action, { headers: { Accept: 'application/json' } });
            if (response.ok) {
                renderLeaderboard((await response.json()).leaderboard);
            }
        } catch {
            // Offline or no server: the list just stays empty.
        }
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
        const shown = shownWorld();
        const player = me();
        const points = player?.points ?? 0;
        const others = shown.snakes.filter((snake) => snake !== player);
        elements.score.textContent = points;
        elements.length.textContent = player?.body.length ?? 0;
        elements.best.textContent = Math.max(best, points);
        elements.bots.textContent = online
            ? `${others.filter((snake) => snake.alive).length}/${others.length}`
            : `${others.filter((snake) => snake.alive).length}/${BOTS.length}`;
        renderPowerUps(state === 'over' || !player ? [] : activePowerUps(shown, player));
    }

    /**
     * One chip per running power-up, with a bar showing the time left.
     */
    function renderPowerUps(powerUps) {
        elements.powerUps.replaceChildren(
            ...powerUps.map((powerUp) => {
                const chip = elements.powerUpChip.content.cloneNode(true);
                chip.querySelector('[data-emoji]').textContent = powerUp.emoji;
                chip.querySelector('[data-label]').textContent = t(`powerUp.${powerUp.type}`);
                const bar = chip.querySelector('[data-bar]');
                bar.style.width = `${Math.max(0, (powerUp.remainingMs / powerUp.durationMs) * 100)}%`;
                bar.style.backgroundColor = powerUp.color;
                return chip;
            }),
        );
    }

    /**
     * Switch every text on the page to the chosen language, including what the game is showing right now.
     */
    function setLanguage(code) {
        language = code;
        t = translator(code);
        storage.set('snake.lang', code);
        applyLanguage();
    }

    function applyLanguage() {
        document.documentElement.lang = language;
        root.querySelectorAll('[data-i18n]').forEach((element) => {
            element.textContent = t(element.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
            element.placeholder = t(element.dataset.i18nPlaceholder);
        });
        root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
            element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
        });
        elements.languageButtons.forEach((button) => {
            button.setAttribute('aria-pressed', String(button.dataset.language === language));
        });

        updateSoundToggle();
        updateHud();
        if (saveStatus) {
            setSaveStatus(saveStatus.key, saveStatus.params);
        }
        if (state === 'over' && result) {
            elements.deathCause.textContent = describePlayerCrash(t, result.cause);
        }
        if (online) {
            renderOnlinePlayers();
        }
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
        elements.soundToggle.textContent = sound.muted ? t('soundOff') : t('soundOn');
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
    $('#online-button').addEventListener('click', () => {
        elements.joinStatus.textContent = '';
        showOverlay('join');
        elements.joinName.focus();
    });
    $('#join-back').addEventListener('click', () => showOverlay('ready'));
    elements.joinForm.addEventListener('submit', joinOnline);
    elements.leaveOnline.addEventListener('click', () => {
        leaveOnline();
        elements.leaveOnline.blur();
    });
    $('#resume-button').addEventListener('click', () => setPaused(false));
    $('#play-again-button').addEventListener('click', newGame);
    elements.saveForm.addEventListener('submit', saveScore);
    elements.soundToggle.addEventListener('click', () => {
        toggleSound();
        elements.soundToggle.blur();
    });
    elements.languageButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setLanguage(button.dataset.language);
            button.blur();
        });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            setPaused(true);
        }
    });

    requestAnimationFrame(frame);
}
