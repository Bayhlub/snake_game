import { createRenderer } from './renderer';
import {
    BOTS,
    DIRECTIONS,
    activePowerUps,
    createWorld,
    describeBotCrash,
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
 */
export function createGame({ sound, translate, best: initialBest = 0, onChange, onMessage, onNewBest }) {
    const t = (key, params) => translate()(key, params);
    const powerUpName = (powerUp) => t(`powerUp.${powerUp.type}`);
    const renderer = createRenderer({ label: powerUpName });
    let world = createWorld();
    let status = 'ready';
    let turnQueue = [];
    let pointerTarget = null;
    let accumulated = 0;
    let lastFrame = performance.now();
    let best = initialBest;
    let result = null;

    function snapshot() {
        const player = getPlayer(world);
        return {
            status,
            points: world.points,
            length: player.body.length,
            best: Math.max(best, world.points),
            bots: `${world.snakes.filter((snake) => !snake.isPlayer && snake.alive).length}/${BOTS.length}`,
            powerUps: status === 'over' ? [] : activePowerUps(world),
            result,
        };
    }

    const emit = () => onChange(snapshot());

    function newGame() {
        world = createWorld();
        turnQueue = [];
        pointerTarget = null;
        accumulated = 0;
        result = null;
        status = 'playing';
        emit();
    }

    function setPaused(paused) {
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
        for (const event of events) {
            renderer.showEvent(event, effectDelayMs);

            if (event.type === 'eat' && event.snake.isPlayer) {
                sound.eat();
            } else if (event.type === 'fruit' && event.snake.isPlayer) {
                sound.fruit();
            } else if (event.type === 'botDied') {
                sound.botDied();
                onMessage(describeBotCrash(translate(), event.snake, event.cause));
            } else if (event.type === 'playerDied') {
                sound.playerDied();
            } else if (event.type === 'powerUp') {
                sound.powerUp();
                onMessage(t('powerUpGot', { emoji: event.powerUp.emoji, label: powerUpName(event.powerUp) }));
            } else if (event.type === 'shieldBroke') {
                sound.shieldBroke();
                onMessage(t('shieldSaved'));
            } else if (event.type === 'powerUpEnded') {
                sound.powerUpEnded();
                onMessage(t('powerUpEnded', { label: powerUpName(event.powerUp) }));
            }
        }
    }

    function gameOver() {
        status = 'over';
        const isNewBest = world.points > best;
        if (isNewBest) {
            best = world.points;
            onNewBest(best);
        }
        result = {
            cause: world.deathCause,
            points: world.points,
            length: getPlayer(world).body.length,
            isNewBest,
        };
    }

    return {
        start: newGame,
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

            if (status === 'playing') {
                accumulated += elapsed;
                let duration = tickDuration(world);

                while (accumulated >= duration && status === 'playing') {
                    accumulated -= duration;
                    const turn = turnQueue.shift() ?? (pointerTarget && directionToward(getPlayer(world), pointerTarget, world));
                    handleEvents(step(world, turn, duration), duration - accumulated);
                    if (world.over) {
                        gameOver();
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
