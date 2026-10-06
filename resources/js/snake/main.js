import { DEFAULT_ZOOM, clampZoom } from './camera.js';
import { BOTS, COLS, DIRECTION_ANGLES, MULTIPLAYER_PORT, ROWS } from './config.js';
import { describeBotCrash, describePlayerCrash, pickLanguage, translator } from './i18n.js';
import { connectOnline } from './online.js';
import { createRenderer, drawSkinPreview } from './renderer.js';
import { SKINS, skinById } from './skins.js';
import { createSound } from './sound.js';
import { wrapAngle } from './space.js';
import { followStick, stickVector } from './steering.js';
import { activePowerUps, createWorld, getPlayer, step, tickDuration } from './world.js';

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
/** Each +/− press or key zooms by this much; the mouse wheel zooms smoothly. */
const ZOOM_STEP = 1.25;

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
        skinPicker: $('#skin-picker'),
        skinOption: $('#skin-option'),
        zoomControls: $('#zoom-controls'),
    };

    let language = pickLanguage(storage.get('snake.lang'), navigator.languages ?? [navigator.language]);
    let t = translator(language);

    const renderer = createRenderer(elements.canvas, COLS, ROWS, {
        label: (powerUp) => t(`powerUp.${powerUp.type}`),
        youLabel: () => t('youTag'),
    });
    const sound = createSound(storage.get('snake.muted') === '1');

    let skin = skinById(storage.get('snake.skin')).id;
    let zoom = clampZoom(Number(storage.get('snake.zoom')) || DEFAULT_ZOOM);
    let world = createWorld(Math.random, { skin });
    let state = 'ready';
    /** An arrow key or button pressed since the last step: the worm turns to head that way. */
    let keyTurn = null;
    /** Where the mouse or finger is steering, as fractions of the board's size (null when not steering). */
    let mouse = null;
    /**
     * Touch steering is a joystick, like Worms Zone: where the finger went down (`base`) and where it
     * is now (`knob`), as fractions of the board's size, plus where it went down on the page.
     */
    let stick = null;
    /** Touch points on the board, to zoom with two fingers: id => { x, y }. */
    const touches = new Map();
    let pinch = null;
    let accumulated = 0;
    let lastFrame = performance.now();
    let best = Number(storage.get('snake.best')) || 0;
    let messageTimer = null;
    /** The save form's status as a translation key, so it can be re-shown in another language. */
    let saveStatus = null;
    /** The finished game shown on the game-over screen: { points, length, cause }. */
    let result = null;
    /** While playing online: { connection, world, lastLength, sentAngle }. */
    let online = null;

    /** The world on screen, and the snake this device controls. */
    const shownWorld = () => online?.world ?? world;
    const me = () => (online ? online.world.me() : getPlayer(world));

    elements.playerName.value = storage.get('snake.name') ?? '';
    elements.joinName.value = elements.playerName.value;
    renderSkinPicker();
    loadLeaderboard();
    applyLanguage();
    updateHud();
    showOverlay('ready');

    function newGame() {
        if (online) {
            online.connection.send({ type: 'respawn' });
            online.sentAngle = null;
            stopSteering();
            state = 'playing';
            showOverlay(null);
            document.activeElement?.blur();
            return;
        }
        world = createWorld(Math.random, { skin });
        keyTurn = null;
        stopSteering();
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
        stopSteering();
        if (online) {
            if (state === 'playing') {
                sendSteer(DIRECTION_ANGLES[name], true);
            }
            return;
        }
        if (state === 'ready') {
            newGame();
        }
        if (state !== 'playing') {
            return;
        }

        keyTurn = DIRECTION_ANGLES[name];
    }

    /**
     * Online: tell the server where the worm should head, when that has changed (or `always`).
     */
    function sendSteer(angle, always = false) {
        if (always || online.sentAngle === null || Math.abs(wrapAngle(angle - online.sentAngle)) > 0.02) {
            online.connection.send({ type: 'steer', angle: Math.round(angle * 1000) / 1000 });
            online.sentAngle = angle;
        }
    }

    function frame(now) {
        const elapsed = Math.min(now - lastFrame, 250);
        lastFrame = now;
        updateZoomControls();

        if (online) {
            const progress = online.world.progress(now);
            renderer.draw(online.world, now, progress, ...aimFor(online.world.me(), { zoom, follow: state === 'playing' }));
            requestAnimationFrame(frame);
            return;
        }

        if (state === 'playing') {
            accumulated += elapsed;
            let duration = tickDuration(world);

            while (accumulated >= duration && state === 'playing') {
                accumulated -= duration;
                const turn = keyTurn ?? steerTurn(getPlayer(world));
                keyTurn = null;
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
        renderer.draw(world, now, isMoving ? Math.min(accumulated / tickDuration(world), 1) : 1, ...aimFor(getPlayer(world), { zoom, follow: isMoving }));
        requestAnimationFrame(frame);
    }

    function stopSteering() {
        mouse = null;
        stick = null;
    }

    /**
     * Which way the player is steering, in cells: the touch joystick, or from the worm's head toward
     * the mouse. Null when not steering (the worm keeps going straight).
     */
    function steerVector(snake) {
        if (state !== 'playing' || !snake?.alive) {
            return null;
        }
        if (stick) {
            // Measured on the canvas, which keeps its shape even when the online field is another.
            return stickVector(stick, COLS, ROWS);
        }
        if (mouse) {
            const point = renderer.pointAt(mouse.fx, mouse.fy);
            const vector = { x: point.x - snake.body[0].x, y: point.y - snake.body[0].y };
            return Math.hypot(vector.x, vector.y) < 1.5 ? null : vector;
        }
        return null;
    }

    /** The heading (radians) to steer toward for the stick or mouse, or null to keep going. */
    function steerTurn(snake) {
        const vector = steerVector(snake);
        return vector ? Math.atan2(vector.y, vector.x) : null;
    }

    /**
     * What the renderer needs to show the steering: a spot for the worm's eyes to look at, and the
     * joystick ring and the arrow in front of the worm.
     */
    function aimFor(snake, view) {
        const aim = steerVector(snake);
        const lookAt = aim ? { x: snake.body[0].x + aim.x, y: snake.body[0].y + aim.y } : null;
        return [lookAt, { ...view, aim, stick: state === 'playing' ? stick : null }];
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
            skin,
            onJoined(remote) {
                clearTimeout(slowNotice);
                online = { connection, world: remote, lastLength: remote.me().body.length, sentAngle: null };
                state = 'playing';
                stopSteering();
                elements.joinButton.disabled = false;
                elements.joinStatus.textContent = '';
                elements.leaveOnline.hidden = false;
                elements.onlinePanel.hidden = false;
                showOverlay(null);
                document.activeElement?.blur();
            },
            onState(remote, events) {
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
                const angle = player?.alive ? steerTurn(player) : null;
                if (angle !== null) {
                    sendSteer(angle);
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
        world = createWorld(Math.random, { skin });
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
        updateSkinPicker();
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
        } else if ((event.key === '+' || event.key === '=') && isFollowing()) {
            setZoom(zoom * ZOOM_STEP);
        } else if (event.key === '-' && isFollowing()) {
            setZoom(zoom / ZOOM_STEP);
        }
    });

    /** The camera follows your worm (and zoom works) while a game is going. */
    function isFollowing() {
        return state === 'playing' || (state === 'paused' && !online);
    }

    function setZoom(next) {
        zoom = clampZoom(next);
        storage.set('snake.zoom', zoom.toFixed(2));
    }

    function updateZoomControls() {
        elements.zoomControls.hidden = !isFollowing();
    }

    /**
     * The skins to choose from on the start screen, each drawn as a little worm.
     */
    function renderSkinPicker() {
        elements.skinPicker.replaceChildren(
            ...SKINS.map((option) => {
                const button = elements.skinOption.content.firstElementChild.cloneNode(true);
                button.dataset.skin = option.id;
                drawSkinPreview(button.querySelector('canvas'), option);
                button.addEventListener('click', () => setSkin(option.id));
                return button;
            }),
        );
        updateSkinPicker();
    }

    function updateSkinPicker() {
        for (const button of elements.skinPicker.children) {
            button.setAttribute('aria-pressed', String(button.dataset.skin === skin));
            button.setAttribute('aria-label', t(`skin.${button.dataset.skin}`));
            button.title = t(`skin.${button.dataset.skin}`);
        }
    }

    function setSkin(id) {
        skin = skinById(id).id;
        storage.set('snake.skin', skin);
        if (state === 'ready' && !online) {
            world = createWorld(Math.random, { skin });
        }
        updateSkinPicker();
    }

    /**
     * Mouse: the worm heads toward the pointer while it is over the board.
     * Touch: a joystick, like Worms Zone. Put a finger down anywhere and drag the way you want to go;
     * lift it and the worm keeps going straight. Two fingers zoom.
     */
    function pointerAt(event) {
        const rect = elements.canvas.getBoundingClientRect();
        return {
            fx: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            fy: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        };
    }

    function touchSpread() {
        const [a, b] = [...touches.values()];
        return Math.hypot(a.x - b.x, a.y - b.y) || 1;
    }

    elements.canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse') {
            elements.canvas.setPointerCapture(event.pointerId);
            touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (touches.size === 2) {
                pinch = { spread: touchSpread(), zoom };
                stopSteering();
                return;
            }
        }
        if (pinch) {
            return;
        }
        if (event.pointerType === 'mouse') {
            mouse = pointerAt(event);
        } else {
            const at = pointerAt(event);
            stick = { base: at, knob: at, origin: { ...at, x: event.clientX, y: event.clientY } };
        }
    });
    elements.canvas.addEventListener('pointermove', (event) => {
        if (touches.has(event.pointerId)) {
            touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }
        if (pinch && touches.size >= 2) {
            if (isFollowing()) {
                setZoom(pinch.zoom * (touchSpread() / pinch.spread));
            }
            return;
        }
        if (event.pointerType === 'mouse') {
            mouse = pointerAt(event);
        } else if (stick && elements.canvas.hasPointerCapture(event.pointerId)) {
            // Measured from where the finger went down, so it can wander past the board's edge.
            const rect = elements.canvas.getBoundingClientRect();
            const { origin } = stick;
            stick.knob = { fx: origin.fx + (event.clientX - origin.x) / rect.width, fy: origin.fy + (event.clientY - origin.y) / rect.height };
            stick.base = followStick(stick.base, stick.knob, COLS, ROWS);
        }
    });
    for (const type of ['pointerup', 'pointercancel']) {
        elements.canvas.addEventListener(type, (event) => {
            touches.delete(event.pointerId);
            if (touches.size < 2) {
                pinch = null;
            }
            if (event.pointerType !== 'mouse') {
                stick = null;
            }
        });
    }
    elements.canvas.addEventListener(
        'wheel',
        (event) => {
            if (isFollowing()) {
                event.preventDefault();
                setZoom(zoom * Math.exp(-event.deltaY * 0.0015));
            }
        },
        { passive: false },
    );
    $('#zoom-in').addEventListener('click', (event) => {
        setZoom(zoom * ZOOM_STEP);
        event.currentTarget.blur();
    });
    $('#zoom-out').addEventListener('click', (event) => {
        setZoom(zoom / ZOOM_STEP);
        event.currentTarget.blur();
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
