import { chooseBotAngle } from './bot.js';
import {
    BOT_MAX_LENGTH,
    BOT_RESPAWN_MS,
    BOT_SAFE_DISTANCE,
    BOTS,
    CELLS_PER_FOOD,
    COLS,
    DROP,
    DROP_LIFETIME_MS,
    DROP_TREATS,
    EAT_DISTANCE,
    FOOD,
    FRUIT_LIFETIME_MS,
    FRUIT_SPAWN_MAX_MS,
    FRUIT_SPAWN_MIN_MS,
    FRUITS,
    HIT_DISTANCE,
    MAGNET_RADIUS,
    MAGNET_SPEED,
    MAX_FRUITS,
    MULTIPLAYER_TICK_MS,
    PLAYER,
    POWER_UP_LIFETIME_MS,
    POWER_UP_SPAWN_MAX_MS,
    POWER_UP_SPAWN_MIN_MS,
    POWER_UPS,
    ROWS,
    SEGMENT_SPACING,
    SHIELD_GRACE_MS,
    SLOW_MO_FACTOR,
    SPAWN_GRACE_MS,
    SPEED,
    TREAT_REACH,
    START_LENGTH,
    TICK_MS,
    TURN_RADIUS,
} from './config.js';
import { skinById } from './skins.js';
import { indexBodies, isInside, wrapAngle } from './space.js';

/**
 * Create a fresh game: bots spread around and food on the board.
 * The field is COLS × ROWS unless `cols` and `rows` say otherwise (the phone app turns it upright).
 *
 * Worms glide at any angle, like Worms Zone: each has a heading (`angle`) that turns toward where it's
 * steered (`targetAngle`), a trail of where its head has been, and a body of points one segment apart
 * along that trail. Positions are in cells (floats).
 *
 * Solo (the default): one player starts on the left, and the game is over when it crashes.
 * Multiplayer: players join and leave with addPlayer / removePlayer; a crashed player turns
 * into food like a bot and waits for respawnPlayer, while the game carries on for everyone else.
 */
export function createWorld(random = Math.random, { cols = COLS, rows = ROWS, multiplayer = false, skin = PLAYER.skin } = {}) {
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
        const player = makeSnake(0, { name: PLAYER.name, color: skinById(skin).color, skin: skinById(skin).id }, true);
        placeSnake(player, { x: 8, y: Math.floor(rows / 2) }, 0, START_LENGTH);
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
export function addPlayer(world, { name, color, skin = null }) {
    const snake = makeSnake(freeId(world), { name, color, skin }, true);
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
 * Multiplayer: bring a crashed player back as a fresh short worm with no points.
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

/** How long one step of the game is: short solo for smooth play, the server's pace online. */
export function tickDuration(world) {
    return world.multiplayer ? MULTIPLAYER_TICK_MS : TICK_MS;
}

/**
 * How fast every worm moves, in cells per second: the same for everyone, however long they grow.
 * Slow-mo slows everyone down (online, while anyone has it).
 */
export function worldSpeed(world) {
    const slowed = world.snakes.some((snake) => snake.isPlayer && isEffectActive(world, 'slow', snake));
    return slowed ? SPEED / SLOW_MO_FACTOR : SPEED;
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
 * Advance the game by `elapsedMs` and return what happened (eating, crashes, power-ups).
 * `turns` is where the solo player is steering (an angle in radians, or null to keep the heading),
 * or, online, { [snake id]: angle }.
 */
export function step(world, turns, elapsedMs) {
    const events = [];
    const seconds = elapsedMs / 1000;
    world.time += elapsedMs;
    const players = world.snakes.filter((snake) => snake.isPlayer);
    const turnFor = (snake) => (typeof turns === 'number' ? (snake === getPlayer(world) ? turns : null) : turns?.[snake.id]);

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

    const movers = world.snakes.filter((snake) => snake.alive);
    const bodies = indexBodies(world);
    for (const snake of movers) {
        if (snake.isPlayer) {
            const turn = turnFor(snake);
            if (Number.isFinite(turn)) {
                snake.targetAngle = wrapAngle(turn);
            }
        } else {
            snake.targetAngle = chooseBotAngle(world, snake, bodies);
        }
    }

    const distance = worldSpeed(world) * seconds;
    for (const snake of movers) {
        moveSnake(snake, distance);
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
            for (const food of takeFoodNear(world, snake)) {
                events.push(eat(world, snake, food));
            }
        }
    }

    for (const player of players) {
        events.push(...pullFoodToPlayer(world, player, seconds));
    }
    refillFood(world);

    return events;
}

/**
 * Turn toward where the worm is steered, along a circle no tighter than TURN_RADIUS, glide
 * `distance` cells forward, and lay the body out along the trail behind the head.
 */
function moveSnake(snake, distance) {
    let turn = wrapAngle(snake.targetAngle - snake.angle);
    // Steered almost straight back, the shorter way round could flip between left and right as the
    // finger wobbles; keep turning the way it already is, so a U-turn is one smooth loop.
    if (Math.abs(turn) > 2.6 && snake.turning) {
        turn = snake.turning * Math.abs(turn);
    }
    const maxTurn = distance / TURN_RADIUS;
    const turned = Math.max(-maxTurn, Math.min(maxTurn, turn));
    snake.turning = Math.abs(turned) > 1e-6 ? Math.sign(turned) : 0;
    snake.previousAngle = snake.angle;
    snake.angle = wrapAngle(snake.angle + turned);
    snake.dir = { x: Math.cos(snake.angle), y: Math.sin(snake.angle) };

    const head = snake.trail[0];
    snake.previousBody = snake.body.map((point) => ({ ...point }));
    snake.trail.unshift({ x: head.x + snake.dir.x * distance, y: head.y + snake.dir.y * distance });
    layBody(snake);
}

/**
 * The body: points SEGMENT_SPACING apart along the trail, from the head back, `snake.length` of
 * them (fewer while it's still growing into a new length). The trail is trimmed to what's used.
 */
function layBody(snake) {
    const { trail } = snake;
    const body = [{ ...trail[0] }];
    let { x, y } = trail[0];
    let toNext = SEGMENT_SPACING;
    let used = 0;

    for (let i = 1; i < trail.length && body.length < snake.length; i++) {
        let left = Math.hypot(trail[i].x - x, trail[i].y - y);
        while (left >= toNext && body.length < snake.length) {
            const t = toNext / left;
            x += (trail[i].x - x) * t;
            y += (trail[i].y - y) * t;
            body.push({ x, y });
            left -= toNext;
            toNext = SEGMENT_SPACING;
        }
        used = i;
        if (body.length < snake.length) {
            toNext -= left;
            x = trail[i].x;
            y = trail[i].y;
        }
    }

    trail.length = Math.min(trail.length, used + 1);
    snake.body = body;
}

/** Put a worm down with its head at `head`, facing `angle`, its body straight out behind it. */
export function placeSnake(snake, head, angle, length) {
    snake.angle = angle;
    snake.previousAngle = angle;
    snake.targetAngle = angle;
    snake.dir = { x: Math.cos(angle), y: Math.sin(angle) };
    snake.length = length;
    snake.trail = [
        { x: head.x, y: head.y },
        { x: head.x - snake.dir.x * length * SEGMENT_SPACING, y: head.y - snake.dir.y * length * SEGMENT_SPACING },
    ];
    layBody(snake);
    snake.previousBody = null;
    snake.alive = true;
}

/**
 * The shield takes the hit instead of the player. Hitting a wall puts the worm back where it was
 * and turns it to face the middle of the field; then it can't hit snakes for a moment.
 */
function breakShield(world, player, cause) {
    delete player.effects.shield;
    player.effects.grace = world.time + SHIELD_GRACE_MS;

    if (cause.type === 'wall') {
        player.trail.shift();
        layBody(player);
        const head = player.body[0];
        const angle = Math.atan2(world.rows / 2 - head.y, world.cols / 2 - head.x);
        player.angle = angle;
        player.targetAngle = angle;
        player.dir = { x: Math.cos(angle), y: Math.sin(angle) };
    }

    return { type: 'shieldBroke', snake: player, at: { ...player.body[0] } };
}

/**
 * A player is see-through while a ghost, and just after its shield breaks.
 */
function isIntangible(world, snake) {
    return snake.isPlayer && (isEffectActive(world, 'ghost', snake) || isEffectActive(world, 'grace', snake));
}

/**
 * Magnet: food near a player's head drifts toward it, and is eaten when it arrives.
 */
function pullFoodToPlayer(world, player, seconds) {
    if (!player.alive || !isEffectActive(world, 'magnet', player)) {
        return [];
    }

    const head = player.body[0];
    const events = [];
    for (const food of [...world.foods]) {
        const dx = head.x - food.x;
        const dy = head.y - food.y;
        const distance = Math.hypot(dx, dy);
        if (food.kind === 'power' || distance > MAGNET_RADIUS) {
            continue;
        }
        const pull = Math.min(distance, MAGNET_SPEED * seconds);
        food.from = { x: food.x, y: food.y };
        food.x += (dx / (distance || 1)) * pull;
        food.y += (dy / (distance || 1)) * pull;
        if (distance - pull < EAT_DISTANCE) {
            world.foods.splice(world.foods.indexOf(food), 1);
            events.push(eat(world, player, food));
        }
    }
    return events;
}

/**
 * The snake whose head runs into a wall or another snake dies; the snake that was hit keeps
 * going. Two heads meeting kills both. A worm can cross its own body.
 */
function findCrashes(world, movers) {
    const bodies = indexBodies(world);
    const crashes = new Map();

    for (const snake of movers) {
        const head = snake.body[0];
        if (!isInside(world, head.x, head.y)) {
            crashes.set(snake, { type: 'wall' });
            continue;
        }
        if (isIntangible(world, snake)) {
            continue;
        }

        let hit = null;
        bodies.near(head.x, head.y, HIT_DISTANCE, (entry) => {
            if (entry.snake !== snake && !isIntangible(world, entry.snake) && (!hit || entry.index < hit.index)) {
                hit = entry;
            }
            return false;
        });
        if (hit) {
            crashes.set(snake, { type: hit.index === 0 ? 'headOn' : 'hit', other: hit.snake });
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

    // The worm turns into a trail of treats along its body, for anyone to eat.
    snake.body.forEach((point, index) => {
        if (index % 2 === 0 && isInside(world, point.x, point.y)) {
            world.foods.push({
                kind: 'drop',
                x: round(point.x),
                y: round(point.y),
                color: snake.color,
                emoji: DROP_TREATS[Math.floor(world.random() * DROP_TREATS.length)],
                ...DROP,
                expiresAt: world.time + DROP_LIFETIME_MS,
            });
        }
    });
    snake.body = [];
    snake.trail = [];
    snake.respawnAt = world.time + BOT_RESPAWN_MS;
}

/**
 * Remove and return the food within reach of a worm's head. Only players can pick up power-ups.
 */
function takeFoodNear(world, snake) {
    const head = snake.body[0];
    const reach = (food) => (food.kind === 'fruit' ? TREAT_REACH : EAT_DISTANCE);
    const eaten = world.foods.filter(
        (food) => Math.hypot(food.x - head.x, food.y - head.y) < reach(food) && (snake.isPlayer || food.kind !== 'power'),
    );
    if (eaten.length) {
        world.foods = world.foods.filter((food) => !eaten.includes(food));
    }
    return eaten;
}

function eat(world, snake, food) {
    const at = { ...snake.body[0] };

    if (food.kind === 'power') {
        snake.effects[food.powerUp.type] = world.time + food.powerUp.durationMs;
        return { type: 'powerUp', snake, food, powerUp: food.powerUp, at };
    }

    snake.length += food.grow;
    if (snake.isPlayer) {
        snake.points += food.points;
    } else {
        snake.length = Math.min(snake.length, BOT_MAX_LENGTH);
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

    const spot = randomFreeSpot(world, indexBodies(world));
    if (spot) {
        const fruit = pickWeighted(world.random, FRUITS);
        world.foods.push({
            kind: 'fruit',
            ...spot,
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
    const spot = world.foods.some((food) => food.kind === 'power') ? null : randomFreeSpot(world, indexBodies(world));
    if (spot) {
        world.foods.push({
            kind: 'power',
            ...spot,
            powerUp: pickWeighted(world.random, POWER_UPS),
            points: 0,
            grow: 0,
            expiresAt: world.time + POWER_UP_LIFETIME_MS,
        });
    }
}

function refillFood(world) {
    let count = world.foods.filter((food) => food.kind === 'food').length;
    if (count >= world.foodCount) {
        return;
    }
    const bodies = indexBodies(world);
    while (count < world.foodCount) {
        const spot = randomFreeSpot(world, bodies);
        if (!spot) {
            return;
        }
        world.foods.push({ kind: 'food', ...spot, ...FOOD });
        count++;
    }
}

/**
 * Place a snake somewhere empty, roughly facing the middle of the field, away from every
 * player's head.
 */
function spawnSnake(world, snake) {
    const bodies = indexBodies(world);
    const heads = world.snakes.filter((other) => other.isPlayer && other.alive && other !== snake).map((other) => other.body[0]);

    for (let attempt = 0; attempt < 200; attempt++) {
        const x = 3 + world.random() * (world.cols - 7);
        const y = 3 + world.random() * (world.rows - 7);
        if (heads.some((head) => Math.hypot(head.x - x, head.y - y) < BOT_SAFE_DISTANCE)) {
            continue;
        }

        const angle = Math.atan2(world.rows / 2 - y, world.cols / 2 - x) + (world.random() - 0.5) * 1.6;
        const length = START_LENGTH;
        // The worm's body, and a few cells of room ahead of it, must be clear.
        let isClear = true;
        for (let along = -length; along <= 4 && isClear; along += 0.5) {
            const px = x + Math.cos(angle) * along;
            const py = y + Math.sin(angle) * along;
            isClear = isInside(world, px, py, 0.5) && !bodies.near(px, py, 2, (entry) => entry.snake !== snake);
        }

        if (isClear) {
            placeSnake(snake, { x: round(x), y: round(y) }, angle, length);
            snake.spawnedAt = world.time;
            return true;
        }
    }

    snake.respawnAt = world.time + 500;
    return false;
}

/** A random spot for food, clear of every worm and of other food. */
function randomFreeSpot(world, bodies) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const x = round(world.random() * (world.cols - 1));
        const y = round(world.random() * (world.rows - 1));
        const nearFood = world.foods.some((food) => Math.hypot(food.x - x, food.y - y) < 1);
        if (!nearFood && !bodies.near(x, y, 1.5, () => true)) {
            return { x, y };
        }
    }
    return null;
}

/** The lowest id no snake is using. */
function freeId(world) {
    const used = new Set(world.snakes.map((snake) => snake.id));
    let id = 0;
    while (used.has(id)) {
        id++;
    }
    return id;
}

function makeSnake(id, { name, color, skin = null }, isPlayer) {
    return {
        id,
        name,
        color,
        skin,
        isPlayer,
        body: [],
        previousBody: null,
        trail: [],
        length: START_LENGTH,
        angle: 0,
        previousAngle: 0,
        targetAngle: 0,
        /** Which way it turned last step: -1, 1, or 0 going straight. */
        turning: 0,
        dir: { x: 1, y: 0 },
        alive: false,
        respawnAt: 0,
        spawnedAt: 0,
        points: 0,
        effects: {},
        deathCause: null,
    };
}

/** Positions are kept to two decimals, which is plenty and keeps what goes online small. */
function round(value) {
    return Math.round(value * 100) / 100;
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
