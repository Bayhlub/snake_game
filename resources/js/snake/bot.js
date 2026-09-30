import { BOT_CARELESSNESS, DIRECTIONS } from './config.js';

const ALL_DIRECTIONS = Object.values(DIRECTIONS);

/**
 * Pick the next direction for a computer snake: head for the best nearby food,
 * while avoiding walls, other snakes, dead ends and cells another head could reach.
 * Its own body is not an obstacle, because a snake can cross itself.
 */
export function chooseBotDirection(world, bot, grid) {
    const head = bot.body[0];
    const target = pickTarget(world, head);
    const careless = world.random() < BOT_CARELESSNESS;
    const isBlocked = (index) => grid[index] !== 0 && grid[index] !== bot.id + 1;

    let bestDirection = bot.dir;
    let bestScore = -Infinity;

    for (const direction of ALL_DIRECTIONS) {
        if (direction.x === -bot.dir.x && direction.y === -bot.dir.y) {
            continue;
        }

        const x = head.x + direction.x;
        const y = head.y + direction.y;
        let score = world.random() * 4;

        if (target) {
            score -= (Math.abs(target.x - x) + Math.abs(target.y - y)) * 10;
        }

        if (!isInside(world, x, y)) {
            score -= 1e6;
        } else if (!careless) {
            if (isBlocked(y * world.cols + x)) {
                score -= 1e6;
            } else {
                const limit = Math.min(bot.body.length * 2, 80);
                const space = countReachableCells(world, isBlocked, x, y, limit);
                if (space < bot.body.length) {
                    score -= 5000 + (bot.body.length - space) * 100;
                }
                if (isNextToOtherHead(world, bot, x, y)) {
                    score -= 800;
                }
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestDirection = direction;
        }
    }

    return bestDirection;
}

function pickTarget(world, head) {
    let best = null;
    let bestDistance = Infinity;

    for (const food of world.foods) {
        if (food.kind === 'power') {
            continue;
        }
        const distance = Math.abs(food.x - head.x) + Math.abs(food.y - head.y) - (food.kind === 'fruit' ? 6 : 0);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = food;
        }
    }

    return best;
}

function countReachableCells(world, isBlocked, startX, startY, limit) {
    const seen = new Set([startY * world.cols + startX]);
    const queue = [[startX, startY]];

    while (queue.length && seen.size < limit) {
        const [x, y] = queue.shift();
        for (const direction of ALL_DIRECTIONS) {
            const nx = x + direction.x;
            const ny = y + direction.y;
            const index = ny * world.cols + nx;
            if (isInside(world, nx, ny) && !isBlocked(index) && !seen.has(index)) {
                seen.add(index);
                queue.push([nx, ny]);
            }
        }
    }

    return seen.size;
}

function isNextToOtherHead(world, bot, x, y) {
    return world.snakes.some((snake) => {
        if (snake === bot || !snake.alive) {
            return false;
        }
        const head = snake.body[0];
        return Math.abs(head.x - x) + Math.abs(head.y - y) === 1;
    });
}

export function isInside(world, x, y) {
    return x >= 0 && y >= 0 && x < world.cols && y < world.rows;
}
