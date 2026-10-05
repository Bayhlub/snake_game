import { BOT_CARELESSNESS } from './config.js';
import { isInside, wrapAngle } from './space.js';

/** Headings a bot considers, as turns from where it's going now (radians). */
const TRIES = [0, -0.35, 0.35, -0.75, 0.75, -1.2, 1.2, -1.7, 1.7, Math.PI];
/** How far ahead (in cells) a bot looks along each heading for walls and other worms. */
const LOOK_AHEAD = [1, 2, 3.2, 4.5, 6];
/** How close (in cells) another worm may come to a bot's path before the bot steers away. */
const ROOM = 1.3;

/**
 * Pick where a computer worm steers next: toward the best nearby food, while keeping clear of
 * walls and other worms ahead of it. Its own body is not an obstacle, because a worm can cross
 * itself. Now and then it doesn't look out for other worms, so bots sometimes make mistakes.
 * `bodies` is the indexBodies() lookup for this step.
 */
export function chooseBotAngle(world, bot, bodies) {
    const head = bot.body[0];
    const target = pickTarget(world, head);
    const careless = world.random() < BOT_CARELESSNESS;
    const wanted = target ? Math.atan2(target.y - head.y, target.x - head.x) : bot.targetAngle + (world.random() - 0.5) * 0.5;

    let best = bot.angle;
    let bestScore = -Infinity;
    for (const offset of TRIES) {
        const angle = wrapAngle(bot.angle + offset);
        let score = -Math.abs(wrapAngle(wanted - angle)) * 10 - Math.abs(offset) + world.random() * 0.5;

        for (const reach of LOOK_AHEAD) {
            const x = head.x + Math.cos(angle) * reach;
            const y = head.y + Math.sin(angle) * reach;
            const blocked = !isInside(world, x, y, 0.9) || (!careless && bodies.near(x, y, ROOM, (entry) => entry.snake !== bot));
            if (blocked) {
                score -= 1000 / reach;
                break;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            best = angle;
        }
    }

    return best;
}

/**
 * The food a bot goes for: the closest, with fruit counting as a bit closer. Bots leave power-ups
 * alone, and food right by a wall, which they couldn't turn away from in time.
 */
function pickTarget(world, head) {
    let best = null;
    let bestDistance = Infinity;

    for (const food of world.foods) {
        if (food.kind === 'power' || !isInside(world, food.x, food.y, 2)) {
            continue;
        }
        const distance = Math.hypot(food.x - head.x, food.y - head.y) - (food.kind === 'fruit' ? 5 : 0);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = food;
        }
    }

    return best;
}
