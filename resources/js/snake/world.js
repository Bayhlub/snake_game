import { chooseBotDirection, isInside } from './bot.js';
import {
    BOT_MAX_LENGTH,
    BOT_RESPAWN_MS,
    BOT_SAFE_DISTANCE,
    BOTS,
    CELLS_PER_FOOD,
    COLS,
    DIRECTIONS,
    DROP_LIFETIME_MS,
    FOOD,
    FRUIT_LIFETIME_MS,
    FRUIT_SPAWN_MAX_MS,
    FRUIT_SPAWN_MIN_MS,
    FRUITS,
    MAGNET_RADIUS,
    MAX_FRUITS,
    MIN_TICK_MS,
    MULTIPLAYER_TICK_MS,
    PLAYER,
    POWER_UP_LIFETIME_MS,
    POWER_UP_SPAWN_MAX_MS,
    POWER_UP_SPAWN_MIN_MS,
    POWER_UPS,
    ROWS,
    SHIELD_GRACE_MS,
    SLOW_MO_FACTOR,
    SPAWN_GRACE_MS,
    START_LENGTH,
    START_TICK_MS,
    TICK_MS_PER_SEGMENT,
} from './config.js';

/**
 * Create a fresh game: bots spread around and food on the board.
 * The field is COLS × ROWS unless `cols` and `rows` say otherwise (the phone app turns it upright).
 *
 * Solo (the default): one player starts on the left, and the game is over when it crashes.
 * Multiplayer: players join and leave with addPlayer / removePlayer; a crashed player turns
 * into food like a bot and waits for respawnPlayer, while the game carries on for everyone else.
 */
export function createWorld(random = Math.random, { cols = COLS, rows = ROWS, multiplayer = false } = {}) {
    const world = {
        cols,
        rows,
        multiplayer,
        foodCount: Math.max(4, Math.round((cols * rows) / CELLS_PER_FOOD)),
        snakes: [],
        foods: [],
        time: 0,
        nextFruitAt: randomBetween(random, FRUIT_SPAWN_MIN_MS, FRUIT_SPAWN_MAX_MS),
        nextPowerUpAt: randomBetween(random, POWER_UP_SPAWN_MIN_MS, POWER_UP_SPAWN_MAX_MS),
        over: false,
        random,
    };

    // Solo shortcuts: the one player's score, power-ups and crash, read straight off the world.
    Object.defineProperties(world, {
        points: {
            get: () => world.snakes[0]?.points ?? 0,
            set: (value) => {
                world.snakes[0].points = value;
            },
        },
        effects: { get: () => world.snakes[0]?.effects ?? {} },
        deathCause: { get: () => world.snakes[0]?.deathCause ?? null },
    });

    if (!multiplayer) {
        const player = makeSnake(0, PLAYER, true);
        const headX = 8;
        const headY = Math.floor(rows / 2);
        player.dir = DIRECTIONS.right;
        player.body = Array.from({ length: START_LENGTH }, (_, i) => ({ x: headX - i, y: headY }));
        player.alive = true;
        world.snakes.push(player);
    }

    BOTS.forEach((bot) => {
        const snake = makeSnake(freeId(world), bot, false);
        world.snakes.push(snake);
        spawnSnake(world, snake);
    });

    refillFood(world);

    return world;
}

/**
 * Multiplayer: add a player to a random empty spot. Returns its snake.
 */
export function addPlayer(world, { name, color }) {
    const snake = makeSnake(freeId(world), { name, color }, true);
    world.snakes.push(snake);
    spawnSnake(world, snake);
    protectNewcomer(world, snake);
    return snake;
}

/**
 * A player who just joined or came back can't crash into snakes (or be crashed into) for a
 * moment, so they get a chance to steer before a passing snake ends their game. They blink meanwhile.
 */
function protectNewcomer(world, snake) {
    snake.effects.grace = world.time + SPAWN_GRACE_MS;
}

export function removePlayer(world, id) {
    world.snakes = world.snakes.filter((snake) => snake.id !== id);
}

/**
 * Multiplayer: bring a crashed player back as a fresh four-segment snake with no points.
 */
export function respawnPlayer(world, snake) {
    snake.points = 0;
    snake.effects = {};
    snake.deathCause = null;
    const spawned = spawnSnake(world, snake);
    protectNewcomer(world, snake);
    return spawned;
}

/** The solo player. */
export function getPlayer(world) {
    return world.snakes[0];
}

/**
 * How long one move takes. Solo, the game speeds up as the player grows; online it keeps an
 * even pace for everyone. Slow-mo stretches it (online, for everyone while anyone has it).
 */
export function tickDuration(world) {
    let duration = MULTIPLAYER_TICK_MS;
    if (!world.multiplayer) {
        const growth = getPlayer(world).body.length - START_LENGTH;
        duration = Math.max(MIN_TICK_MS, START_TICK_MS - growth * TICK_MS_PER_SEGMENT);
    }
    const slowed = world.snakes.some((snake) => snake.isPlayer && isEffectActive(world, 'slow', snake));
    return slowed ? duration * SLOW_MO_FACTOR : duration;
}

export function isEffectActive(world, type, snake = getPlayer(world)) {
    return (snake?.effects?.[type] ?? 0) > world.time;
}

/**
 * A player's running power-ups with the time left, for the HUD.
 */
export function activePowerUps(world, snake = getPlayer(world)) {
    return POWER_UPS.filter((powerUp) => isEffectActive(world, powerUp.type, snake)).map((powerUp) => ({
        ...powerUp,
        remainingMs: snake.effects[powerUp.type] - world.time,
    }));
}

/**
 * Advance the game by one move and return what happened (eating, crashes, power-ups).
 * `turns` is the solo player's new direction, or, online, { [snake id]: direction }.
 */
export function step(world, turns, elapsedMs) {
    const events = [];
    world.time += elapsedMs;
    const players = world.snakes.filter((snake) => snake.isPlayer);
    const turnFor = (snake) => (turns && 'x' in turns ? (snake === getPlayer(world) ? turns : null) : turns?.[snake.id]);

    for (const player of players) {
        for (const powerUp of POWER_UPS) {
            if (player.effects[powerUp.type] && !isEffectActive(world, powerUp.type, player)) {
                delete player.effects[powerUp.type];
                events.push({ type: 'powerUpEnded', powerUp, snake: player });
            }
        }
    }
    for (const food of world.foods) {
        food.from = null;
    }

    respawnBots(world);
    updateFruit(world);
    updatePowerUps(world);

    const grid = occupancyGrid(world);
    const movers = world.snakes.filter((snake) => snake.alive);

    for (const snake of movers) {
        if (snake.isPlayer) {
            const turn = turnFor(snake);
            if (turn && !isReverse(turn, snake.dir)) {
                snake.dir = turn;
            }
        } else {
            snake.dir = chooseBotDirection(world, snake, grid);
        }
    }

    for (const snake of movers) {
        const head = snake.body[0];
        snake.previousBody = snake.body.map((cell) => ({ ...cell }));
        snake.body.unshift({ x: head.x + snake.dir.x, y: head.y + snake.dir.y });
        if (snake.growth > 0) {
            snake.growth--;
        } else {
            snake.body.pop();
        }
    }

    const crashes = findCrashes(world, movers);
    for (const [snake, cause] of crashes) {
        if (snake.isPlayer && isEffectActive(world, 'shield', snake)) {
            events.push(breakShield(world, snake, cause));
            crashes.delete(snake);
        }
    }

    for (const [snake, cause] of crashes) {
        const at = { ...snake.body[0] };
        killSnake(world, snake, cause);
        events.push({ type: snake.isPlayer ? 'playerDied' : 'botDied', snake, cause, at });
    }

    for (const snake of movers) {
        if (snake.alive) {
            const food = takeFoodAt(world, snake, snake.body[0]);
            if (food) {
                events.push(eat(world, snake, food));
            }
        }
    }

    for (const player of players) {
        events.push(...pullFoodToPlayer(world, player));
    }
    refillFood(world);

    return events;
}

/**
 * The shield takes the hit instead of the player. Hitting a wall bounces the snake
 * back and turns it toward open space; then it can't hit snakes for a moment.
 */
function breakShield(world, player, cause) {
    delete player.effects.shield;
    player.effects.grace = world.time + SHIELD_GRACE_MS;

    if (cause.type === 'wall') {
        player.body = player.previousBody.map((cell) => ({ ...cell }));
        player.dir = escapeDirection(world, player);
    }

    return { type: 'shieldBroke', snake: player, at: { ...player.body[0] } };
}

function escapeDirection(world, snake) {
    const head = snake.body[0];
    const roomToward = (dir) => {
        let room = 0;
        while (isInside(world, head.x + dir.x * (room + 1), head.y + dir.y * (room + 1))) {
            room++;
        }
        return room;
    };

    return Object.values(DIRECTIONS)
        .filter((dir) => dir !== snake.dir && !isReverse(dir, snake.dir))
        .sort((a, b) => roomToward(b) - roomToward(a))[0];
}

/**
 * A player is see-through while a ghost, and just after its shield breaks.
 */
function isIntangible(world, snake) {
    return snake.isPlayer && (isEffectActive(world, 'ghost', snake) || isEffectActive(world, 'grace', snake));
}

/**
 * Magnet: food near a player's head slides one cell closer each move, and food
 * within two cells is pulled straight in (so it can't trail diagonally beside the head).
 */
function pullFoodToPlayer(world, player) {
    if (!player.alive || !isEffectActive(world, 'magnet', player)) {
        return [];
    }

    const head = player.body[0];
    const grid = occupancyGrid(world);
    const events = [];

    for (const food of [...world.foods]) {
        const dx = head.x - food.x;
        const dy = head.y - food.y;
        const distance = Math.abs(dx) + Math.abs(dy);
        if (food.kind === 'power' || distance === 0 || distance > MAGNET_RADIUS || !world.foods.includes(food)) {
            continue;
        }

        if (distance <= 2) {
            food.from = { x: food.x, y: food.y };
            world.foods.splice(world.foods.indexOf(food), 1);
            events.push(eat(world, player, food));
            continue;
        }

        const x = food.x + (Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0);
        const y = food.y + (Math.abs(dx) >= Math.abs(dy) ? 0 : Math.sign(dy));
        if (!grid[y * world.cols + x] && !foodAt(world, x, y)) {
            food.from = { x: food.x, y: food.y };
            food.x = x;
            food.y = y;
        }
    }

    return events;
}

/**
 * The snake whose head runs into a wall or another snake dies; the snake that was
 * hit keeps going. Two heads meeting kills both. A snake can cross its own body.
 */
function findCrashes(world, movers) {
    const cells = new Map();
    for (const snake of movers) {
        snake.body.forEach((cell, index) => {
            if (isInside(world, cell.x, cell.y)) {
                const key = cell.y * world.cols + cell.x;
                if (!cells.has(key)) {
                    cells.set(key, []);
                }
                cells.get(key).push({ snake, index });
            }
        });
    }

    const crashes = new Map();
    for (const snake of movers) {
        const head = snake.body[0];
        if (!isInside(world, head.x, head.y)) {
            crashes.set(snake, { type: 'wall' });
            continue;
        }

        const other = cells
            .get(head.y * world.cols + head.x)
            .find((occupant) => occupant.snake !== snake && !isIntangible(world, occupant.snake) && !isIntangible(world, snake));
        if (other) {
            crashes.set(snake, { type: other.index === 0 ? 'headOn' : 'hit', other: other.snake });
        }
    }

    return crashes;
}

function killSnake(world, snake, cause) {
    snake.alive = false;

    if (snake.isPlayer) {
        snake.deathCause = cause;
        if (!world.multiplayer) {
            world.over = true;
            return;
        }
    }

    snake.body.forEach((cell, index) => {
        if (index % 2 === 0 && isInside(world, cell.x, cell.y) && !foodAt(world, cell.x, cell.y)) {
            world.foods.push({
                kind: 'drop',
                x: cell.x,
                y: cell.y,
                color: snake.color,
                ...FOOD,
                expiresAt: world.time + DROP_LIFETIME_MS,
            });
        }
    });
    snake.body = [];
    snake.respawnAt = world.time + BOT_RESPAWN_MS;
}

/**
 * Remove and return the food at a cell. Only players can pick up power-ups.
 */
function takeFoodAt(world, snake, cell) {
    const index = world.foods.findIndex(
        (food) => food.x === cell.x && food.y === cell.y && (snake.isPlayer || food.kind !== 'power'),
    );
    return index === -1 ? null : world.foods.splice(index, 1)[0];
}

function eat(world, snake, food) {
    const at = { ...snake.body[0] };

    if (food.kind === 'power') {
        snake.effects[food.powerUp.type] = world.time + food.powerUp.durationMs;
        return { type: 'powerUp', snake, food, powerUp: food.powerUp, at };
    }

    snake.growth += food.grow;
    if (snake.isPlayer) {
        snake.points += food.points;
    } else {
        snake.growth = Math.min(snake.growth, Math.max(0, BOT_MAX_LENGTH - snake.body.length));
    }

    return { type: food.kind === 'fruit' ? 'fruit' : 'eat', snake, food, at };
}

function respawnBots(world) {
    for (const snake of world.snakes) {
        if (!snake.alive && !snake.isPlayer && world.time >= snake.respawnAt) {
            spawnSnake(world, snake);
        }
    }
}

function updateFruit(world) {
    world.foods = world.foods.filter((food) => !food.expiresAt || food.expiresAt > world.time);

    if (world.time < world.nextFruitAt) {
        return;
    }

    world.nextFruitAt = world.time + randomBetween(world.random, FRUIT_SPAWN_MIN_MS, FRUIT_SPAWN_MAX_MS);
    if (world.foods.filter((food) => food.kind === 'fruit').length >= MAX_FRUITS) {
        return;
    }

    const cell = randomFreeCell(world);
    if (cell) {
        const fruit = pickWeighted(world.random, FRUITS);
        world.foods.push({
            kind: 'fruit',
            ...cell,
            emoji: fruit.emoji,
            points: fruit.points,
            grow: fruit.grow,
            expiresAt: world.time + FRUIT_LIFETIME_MS,
        });
    }
}

/**
 * Every so often a power-up appears somewhere empty; at most one is on the board at a time.
 */
function updatePowerUps(world) {
    if (world.time < world.nextPowerUpAt) {
        return;
    }

    world.nextPowerUpAt = world.time + randomBetween(world.random, POWER_UP_SPAWN_MIN_MS, POWER_UP_SPAWN_MAX_MS);
    const cell = world.foods.some((food) => food.kind === 'power') ? null : randomFreeCell(world);
    if (cell) {
        world.foods.push({
            kind: 'power',
            ...cell,
            powerUp: pickWeighted(world.random, POWER_UPS),
            points: 0,
            grow: 0,
            expiresAt: world.time + POWER_UP_LIFETIME_MS,
        });
    }
}

function refillFood(world) {
    let count = world.foods.filter((food) => food.kind === 'food').length;
    while (count < world.foodCount) {
        const cell = randomFreeCell(world);
        if (!cell) {
            return;
        }
        world.foods.push({ kind: 'food', ...cell, ...FOOD });
        count++;
    }
}

/**
 * Place a snake somewhere empty, facing open space and away from every player's head.
 */
function spawnSnake(world, snake) {
    const grid = occupancyGrid(world);
    const heads = world.snakes.filter((other) => other.isPlayer && other.alive && other !== snake).map((other) => other.body[0]);
    const directions = Object.values(DIRECTIONS);

    for (let attempt = 0; attempt < 200; attempt++) {
        const dir = directions[Math.floor(world.random() * directions.length)];
        const x = 3 + Math.floor(world.random() * (world.cols - 6));
        const y = 3 + Math.floor(world.random() * (world.rows - 6));

        if (heads.some((head) => Math.abs(head.x - x) + Math.abs(head.y - y) < BOT_SAFE_DISTANCE)) {
            continue;
        }

        const cells = [];
        for (let i = -3; i < START_LENGTH; i++) {
            cells.push({ x: x - dir.x * i, y: y - dir.y * i });
        }
        const isClear = cells.every((cell) => isInside(world, cell.x, cell.y) && !grid[cell.y * world.cols + cell.x]);

        if (isClear) {
            snake.body = cells.slice(3);
            snake.previousBody = null;
            snake.dir = dir;
            snake.growth = 0;
            snake.alive = true;
            snake.spawnedAt = world.time;
            return true;
        }
    }

    snake.respawnAt = world.time + 500;
    return false;
}

/**
 * A flat grid of the board where each cell holds (snake id + 1), or 0 when empty.
 */
export function occupancyGrid(world) {
    const grid = new Uint8Array(world.cols * world.rows);
    for (const snake of world.snakes) {
        if (!snake.alive) {
            continue;
        }
        for (const cell of snake.body) {
            if (isInside(world, cell.x, cell.y)) {
                grid[cell.y * world.cols + cell.x] = snake.id + 1;
            }
        }
    }
    return grid;
}

function randomFreeCell(world) {
    const grid = occupancyGrid(world);
    for (let attempt = 0; attempt < 200; attempt++) {
        const x = Math.floor(world.random() * world.cols);
        const y = Math.floor(world.random() * world.rows);
        if (!grid[y * world.cols + x] && !foodAt(world, x, y)) {
            return { x, y };
        }
    }
    return null;
}

function foodAt(world, x, y) {
    return world.foods.find((food) => food.x === x && food.y === y);
}

/** The lowest id no snake is using (ids fit in the occupancy grid's bytes). */
function freeId(world) {
    const used = new Set(world.snakes.map((snake) => snake.id));
    let id = 0;
    while (used.has(id)) {
        id++;
    }
    return id;
}

function makeSnake(id, { name, color }, isPlayer) {
    return {
        id,
        name,
        color,
        isPlayer,
        body: [],
        previousBody: null,
        dir: DIRECTIONS.right,
        growth: 0,
        alive: false,
        respawnAt: 0,
        spawnedAt: 0,
        points: 0,
        effects: {},
        deathCause: null,
    };
}

export function isReverse(a, b) {
    return a.x === -b.x && a.y === -b.y;
}

function randomBetween(random, min, max) {
    return min + random() * (max - min);
}

function pickWeighted(random, items) {
    let roll = random() * items.reduce((sum, item) => sum + item.weight, 0);
    for (const item of items) {
        roll -= item.weight;
        if (roll <= 0) {
            return item;
        }
    }
    return items[items.length - 1];
}
