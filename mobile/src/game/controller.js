import { createRenderer } from './renderer';
import {
    BOTS,
    DIRECTION_ANGLES,
    activePowerUps,
    clampZoom,
    connectOnline,
    createWorld,
    describeBotCrash,
    getPlayer,
    skinById,
    step,
    stickVector,
    tickDuration,
    wrapAngle,
} from './shared';

/**
 * The game loop and controls from resources/js/snake/main.js, without the DOM.
 * The screen calls frame() on every animation frame and gets back a Skia picture to show;
 * onChange reports the HUD and game state whenever they change.
 * `translate()` returns the current language's translate function, so messages follow a language switch.
 * `shape` ({ cols, rows }) is the field size for new games: upright when the phone is held upright.
 * `skin` is the worm skin you play with, `zoom` how far the camera zooms in on your worm while you play.
 *
 * Solo, the whole game runs here. Online (joinOnline), the multiplayer server runs it and this
 * draws what the server sends and passes the player's turns back.
 */
export function createGame({ sound, translate, shape: initialShape, skin: initialSkin, zoom: initialZoom, best: initialBest = 0, onChange, onMessage, onNewBest }) {
    const t = (key, params) => translate()(key, params);
    const powerUpName = (powerUp) => t(`powerUp.${powerUp.type}`);
    const renderer = createRenderer({ label: powerUpName, youLabel: () => t('youTag') });
    let shape = initialShape;
    let skin = skinById(initialSkin).id;
    let zoom = clampZoom(initialZoom);
    const newWorld = () => createWorld(Math.random, { ...shape, skin });
    let world = newWorld();
    let status = 'ready';
    /** An arrow button pressed since the last step: the worm turns to head that way. */
    let keyTurn = null;
    /**
     * The touch joystick, like Worms Zone: where the finger went down (`base`) and where it is now
     * (`knob`), as fractions of the board's size. Null when no finger is down.
     */
    let stick = null;
    let accumulated = 0;
    let lastFrame = performance.now();
    let best = initialBest;
    let result = null;
    /** While playing online: { connection, world, lastStateAt, lastLength }. */
    let online = null;

    const shownWorld = () => online?.world ?? world;
    const me = () => (online ? online.world.me() : getPlayer(world));

    function snapshot() {
        const shown = shownWorld();
        const player = me();
        const points = player?.points ?? 0;
        const others = shown.snakes.filter((snake) => snake !== player);
        return {
            status,
            online: Boolean(online),
            cols: shown.cols,
            rows: shown.rows,
            points,
            length: player?.body.length ?? 0,
            best: Math.max(best, points),
            bots: `${others.filter((snake) => snake.alive).length}/${online ? others.length : BOTS.length}`,
            powerUps: status === 'over' || !player ? [] : activePowerUps(shown, player),
            following: isFollowing(),
            skin,
            players: online
                ? shown.snakes
                      .filter((snake) => snake.isPlayer)
                      .sort((a, b) => b.points - a.points)
                      .map((snake) => ({ id: snake.id, name: snake.name, color: snake.color, points: snake.points, alive: snake.alive, isMe: snake === player }))
                : [],
            result,
        };
    }

    const emit = () => onChange(snapshot());

    /** The camera follows your worm (and zoom works) while a game is going. */
    function isFollowing() {
        return status === 'playing' || (status === 'paused' && !online);
    }

    function newGame() {
        result = null;
        stopSteering();
        if (online) {
            online.connection.send({ type: 'respawn' });
            online.sentAngle = null;
            status = 'playing';
            emit();
            return;
        }
        world = newWorld();
        keyTurn = null;
        accumulated = 0;
        status = 'playing';
        emit();
    }

    function setPaused(paused) {
        if (online) {
            return;
        }
        if (paused && status === 'playing') {
            status = 'paused';
            emit();
        } else if (!paused && status === 'paused') {
            status = 'playing';
            lastFrame = performance.now();
            emit();
        }
    }

    function queueTurn(name) {
        stopSteering();
        if (online) {
            if (status === 'playing') {
                sendSteer(DIRECTION_ANGLES[name], true);
            }
            return;
        }
        if (status === 'ready') {
            newGame();
        }
        if (status !== 'playing') {
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

    function stopSteering() {
        stick = null;
    }

    /** Which way the joystick points, in cells; null when not steering (the worm keeps going straight). */
    function steerVector(snake) {
        if (status !== 'playing' || !snake?.alive || !stick) {
            return null;
        }
        return stickVector(stick, shownWorld().cols, shownWorld().rows);
    }

    /** The heading (radians) to steer toward for the joystick, or null to keep going. */
    function steerTurn(snake) {
        const vector = steerVector(snake);
        return vector ? Math.atan2(vector.y, vector.x) : null;
    }

    /**
     * Draw a frame, with the joystick, the arrow in front of the worm, and the worm's eyes looking
     * the way it's steered.
     */
    function draw(shown, snake, now, progress, width, height) {
        const aim = steerVector(snake);
        const lookAt = aim ? { x: snake.body[0].x + aim.x, y: snake.body[0].y + aim.y } : null;
        return renderer.draw(shown, now, progress, lookAt, width, height, {
            zoom,
            follow: isFollowing(),
            aim,
            stick: status === 'playing' ? stick : null,
        });
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
                onMessage(describeBotCrash(translate(), event.snake, event.cause, player));
            } else if (event.type === 'playerDied') {
                sound.playerDied();
            } else if (event.type === 'powerUp' && isMine) {
                sound.powerUp();
                onMessage(t('powerUpGot', { emoji: event.powerUp.emoji, label: powerUpName(event.powerUp) }));
            } else if (event.type === 'shieldBroke' && isMine) {
                sound.shieldBroke();
                onMessage(t('shieldSaved'));
            } else if (event.type === 'powerUpEnded' && isMine) {
                sound.powerUpEnded();
                onMessage(t('powerUpEnded', { label: powerUpName(event.powerUp) }));
            }
        }
    }

    function gameOver({ points, length, cause }) {
        status = 'over';
        const isNewBest = points > best;
        if (isNewBest) {
            best = points;
            onNewBest(best);
        }
        result = { cause, points, length, isNewBest };
    }

    /**
     * Join the game server at `url` as `name`. `onDone(reason)` reports the outcome:
     * null when joined, or 'offline' / 'full' when it couldn't.
     */
    function joinOnline(url, name, onDone) {
        const connection = connectOnline(url, name, {
            skin,
            onJoined(remote) {
                online = { connection, world: remote, lastStateAt: performance.now(), lastLength: remote.me().body.length, sentAngle: null };
                status = 'playing';
                result = null;
                stopSteering();
                onDone(null);
                emit();
            },
            onState(remote, events) {
                online.lastStateAt = performance.now();
                handleEvents(events, remote.tickMs);
                const player = remote.me();
                const myCrash = events.find((event) => event.type === 'playerDied' && event.snake === player);
                if (myCrash && status === 'playing') {
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
                emit();
            },
            onFailed: (reason) => onDone(reason),
            onClosed() {
                leaveOnline();
                onMessage(t('disconnected'));
            },
        });
    }

    function leaveOnline() {
        online?.connection.leave();
        online = null;
        world = newWorld();
        status = 'ready';
        result = null;
        stopSteering();
        emit();
    }

    return {
        start: newGame,
        joinOnline,
        leaveOnline,

        /** Use a new field shape from the next game on; before the first game, switch right away. */
        setShape(next) {
            if (next.cols === shape.cols && next.rows === shape.rows) {
                return;
            }
            shape = next;
            if (status === 'ready' && !online) {
                world = newWorld();
                emit();
            }
        },

        /** Wear another skin; before a game starts, the waiting worm changes right away. */
        setSkin(id) {
            skin = skinById(id).id;
            if (status === 'ready' && !online) {
                world = newWorld();
            }
            emit();
        },

        get zoom() {
            return zoom;
        },
        setZoom(next) {
            zoom = clampZoom(next);
        },
        pause: () => setPaused(true),
        resume: () => setPaused(false),
        queueTurn,

        /**
         * Steer with the touch joystick while a finger is down: `{ base, knob }`, each a spot on the
         * board as fractions (0–1) of its width and height. Null when the finger lifts.
         */
        steerStick(next) {
            if (next) {
                stick = next;
            } else {
                stopSteering();
            }
        },

        frame(now, width, height) {
            const elapsed = Math.min(now - lastFrame, 250);
            lastFrame = now;

            if (online) {
                const progress = Math.min((now - online.lastStateAt) / online.world.tickMs, 1);
                return draw(online.world, online.world.me(), now, progress, width, height);
            }

            if (status === 'playing') {
                accumulated += elapsed;
                let duration = tickDuration(world);

                while (accumulated >= duration && status === 'playing') {
                    accumulated -= duration;
                    const turn = keyTurn ?? steerTurn(getPlayer(world));
                    keyTurn = null;
                    handleEvents(step(world, turn, duration), duration - accumulated);
                    if (world.over) {
                        gameOver({ points: world.points, length: getPlayer(world).body.length, cause: world.deathCause });
                    }
                    emit();
                    duration = tickDuration(world);
                }
            }

            const isMoving = status === 'playing' || status === 'paused';
            const progress = isMoving ? Math.min(accumulated / tickDuration(world), 1) : 1;
            return draw(world, getPlayer(world), now, progress, width, height);
        },

        snapshot,
    };
}
