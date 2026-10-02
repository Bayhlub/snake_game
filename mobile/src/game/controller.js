import { createRenderer } from './renderer';
import {
    BOTS,
    DIRECTIONS,
    activePowerUps,
    connectOnline,
    createWorld,
    describeBotCrash,
    directionName,
    directionToward,
    getPlayer,
    isReverse,
    step,
    tickDuration,
} from './shared';

const MAX_QUEUED_TURNS = 3;

/**
 * The game loop and controls from resources/js/snake/main.js, without the DOM.
 * The screen calls frame() on every animation frame and gets back a Skia picture to show;
 * onChange reports the HUD and game state whenever they change.
 * `translate()` returns the current language's translate function, so messages follow a language switch.
 * `shape` ({ cols, rows }) is the field size for new games: upright when the phone is held upright.
 *
 * Solo, the whole game runs here. Online (joinOnline), the multiplayer server runs it and this
 * draws what the server sends and passes the player's turns back.
 */
export function createGame({ sound, translate, shape: initialShape, best: initialBest = 0, onChange, onMessage, onNewBest }) {
    const t = (key, params) => translate()(key, params);
    const powerUpName = (powerUp) => t(`powerUp.${powerUp.type}`);
    const renderer = createRenderer({ label: powerUpName, youLabel: () => t('youTag') });
    let shape = initialShape;
    let world = createWorld(Math.random, shape);
    let status = 'ready';
    let turnQueue = [];
    let pointerTarget = null;
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

    function newGame() {
        result = null;
        pointerTarget = null;
        if (online) {
            online.connection.send({ type: 'respawn' });
            status = 'playing';
            emit();
            return;
        }
        world = createWorld(Math.random, shape);
        turnQueue = [];
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
        pointerTarget = null;
        if (online) {
            if (status === 'playing') {
                online.connection.send({ type: 'turn', dir: name });
            }
            return;
        }
        if (status === 'ready') {
            newGame();
        }
        if (status !== 'playing') {
            return;
        }

        const direction = DIRECTIONS[name];
        const previous = turnQueue.at(-1) ?? getPlayer(world).dir;
        if (direction === previous || isReverse(direction, previous) || turnQueue.length >= MAX_QUEUED_TURNS) {
            return;
        }
        turnQueue.push(direction);
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
            onJoined(remote) {
                online = { connection, world: remote, lastStateAt: performance.now(), lastLength: remote.me().body.length };
                status = 'playing';
                result = null;
                pointerTarget = null;
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
                if (status === 'playing' && pointerTarget && player?.alive) {
                    const turn = directionToward(player, pointerTarget, remote);
                    if (turn) {
                        connection.send({ type: 'turn', dir: directionName(turn) });
                    }
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
        world = createWorld(Math.random, shape);
        status = 'ready';
        result = null;
        pointerTarget = null;
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
                world = createWorld(Math.random, shape);
                emit();
            }
        },
        pause: () => setPaused(true),
        resume: () => setPaused(false),
        queueTurn,

        /** Steer toward a board cell while a finger is down; null when it lifts. */
        steerTo(cell) {
            pointerTarget = cell;
        },

        frame(now, width, height) {
            const elapsed = Math.min(now - lastFrame, 250);
            lastFrame = now;

            if (online) {
                const progress = Math.min((now - online.lastStateAt) / online.world.tickMs, 1);
                return renderer.draw(online.world, now, progress, status === 'playing' ? pointerTarget : null, width, height);
            }

            if (status === 'playing') {
                accumulated += elapsed;
                let duration = tickDuration(world);

                while (accumulated >= duration && status === 'playing') {
                    accumulated -= duration;
                    const turn = turnQueue.shift() ?? (pointerTarget && directionToward(getPlayer(world), pointerTarget, world));
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
            return renderer.draw(world, now, progress, status === 'playing' ? pointerTarget : null, width, height);
        },

        snapshot,
    };
}
