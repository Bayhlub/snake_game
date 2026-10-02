import { CELL } from './config.js';
import { isEffectActive } from './world.js';

const FOOD_COLOR = '#facc15';
const FOOD_CORE = '#fef9c3';
const DEAD_COLOR = '#6b7280';
const TONGUE_COLOR = '#f43f5e';
const SHIELD_COLOR = '#38bdf8';
const MAGNET_COLOR = '#f472b6';
const SLOW_TINT = '#8b5cf6';
const EMOJI_FONT = `${Math.round(CELL * 1.05)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const ORB_EMOJI_FONT = `${Math.round(CELL * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const POPUP_FONT = `700 ${Math.round(CELL * 0.8)}px Fredoka, "Noto Sans Lao", "Leelawadee UI", "Lao Sangam MN", ui-sans-serif, system-ui, sans-serif`;
const FIREFLIES = 14;
const YOU_COLOR = '#4ade80';
const TAG_FONT = `700 ${Math.round(CELL * 0.95)}px Fredoka, "Noto Sans Lao", "Leelawadee UI", "Lao Sangam MN", ui-sans-serif, system-ui, sans-serif`;
/** How long the rings around the player's head pulse at the start of a game. */
const INTRO_MS = 3500;

/**
 * Draws the world onto a canvas. The canvas keeps a fixed pixel size and CSS scales it to fit.
 * Snakes glide between cells: `progress` (0–1) says how far the current move has gone.
 * `label(powerUp)` gives a power-up's name in the player's language, `youLabel()` the player's name tag.
 */
export function createRenderer(canvas, cols, rows, { label = (powerUp) => powerUp.label, youLabel = () => 'YOU' } = {}) {
    const ctx = canvas.getContext('2d');
    const width = cols * CELL;
    const height = rows * CELL;
    const scale = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const board = drawBoard(cols, rows, scale);
    const vignette = drawVignette(width, height, scale);
    const foodBornAt = new WeakMap();
    let pending = [];
    let particles = [];
    let rings = [];
    let popups = [];
    let shake = { until: 0, duration: 1, magnitude: 0 };
    let flash = { until: 0, duration: 1, color: '#ffffff', strength: 0 };
    let lastNow = performance.now();

    function burst(x, y, color, count, speed) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = speed * (0.4 + Math.random() * 0.6);
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                life: 1,
                decay: 1.4 + Math.random() * 1.2,
                size: 1.5 + Math.random() * 2.5,
                color,
            });
        }
    }

    function startShake(now, magnitude, duration) {
        if (magnitude >= shake.magnitude * Math.max(0, (shake.until - now) / shake.duration)) {
            shake = { until: now + duration, duration, magnitude };
        }
    }

    function startFlash(now, color, strength, duration) {
        flash = { until: now + duration, duration, color, strength };
    }

    function runEffect(event, now) {
        const x = (event.at?.x ?? event.food.x) * CELL + CELL / 2;
        const y = (event.at?.y ?? event.food.y) * CELL + CELL / 2;

        if (event.type === 'eat') {
            burst(x, y, event.food.kind === 'drop' ? event.food.color : FOOD_COLOR, event.snake.isPlayer ? 10 : 5, 60);
            if (event.snake.isPlayer) {
                popups.push({ x, y, text: `+${event.food.points}`, color: '#fef08a', life: 1 });
            }
        } else if (event.type === 'fruit') {
            burst(x, y, '#fb7185', 16, 90);
            burst(x, y, '#fde68a', 10, 70);
            if (event.snake.isPlayer) {
                popups.push({ x, y, text: `+${event.food.points}`, color: '#fda4af', life: 1 });
            }
        } else if (event.type === 'powerUp') {
            burst(x, y, event.powerUp.color, 24, 110);
            rings.push({ x, y, color: event.powerUp.color, born: now, duration: 600, radius: CELL * 3.5 });
            popups.push({ x, y, text: `${label(event.powerUp)}!`, color: event.powerUp.color, life: 1.3 });
            startFlash(now, event.powerUp.color, 0.18, 350);
        } else if (event.type === 'shieldBroke') {
            burst(x, y, SHIELD_COLOR, 30, 140);
            burst(x, y, '#ffffff', 10, 90);
            rings.push({ x, y, color: SHIELD_COLOR, born: now, duration: 500, radius: CELL * 2.5 });
            startShake(now, 5, 320);
            startFlash(now, SHIELD_COLOR, 0.25, 300);
        } else {
            burst(x, y, event.snake.color, 28, 130);
            burst(x, y, '#ffffff', 8, 80);
            if (event.type === 'playerDied') {
                startShake(now, 8, 480);
                startFlash(now, '#f43f5e', 0.35, 420);
            } else if (event.cause.other?.isPlayer) {
                startShake(now, 3, 220);
            }
        }
    }

    return {
        /**
         * Show an effect once the gliding snake visually reaches the spot where it happened.
         */
        showEvent(event, delayMs) {
            if (event.type === 'powerUpEnded') {
                return;
            }
            const isInstant = event.type === 'playerDied' || event.type === 'shieldBroke';
            pending.push({ event, runAt: performance.now() + (isInstant ? 0 : delayMs) });
        },

        draw(world, now, progress, target = null) {
            const elapsed = Math.min((now - lastNow) / 1000, 0.1);
            lastNow = now;

            pending = pending.filter((effect) => {
                if (now < effect.runAt) {
                    return true;
                }
                runEffect(effect.event, now);
                return false;
            });
            const soonEaten = pending.map((effect) => effect.event.food).filter(Boolean);
            // Solo there is one player; online, `meId` says which of the players is on this device.
            const players = world.snakes.filter((snake) => snake.isPlayer);
            const me = world.meId != null ? players.find((snake) => snake.id === world.meId) : players[0];

            ctx.fillStyle = '#07100c';
            ctx.fillRect(0, 0, width, height);
            ctx.save();
            if (now < shake.until) {
                const strength = shake.magnitude * ((shake.until - now) / shake.duration);
                ctx.translate((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength);
            }

            ctx.drawImage(board, 0, 0, width, height);
            drawFireflies(ctx, width, height, now);

            for (const food of [...world.foods, ...soonEaten]) {
                if (!foodBornAt.has(food)) {
                    foodBornAt.set(food, now);
                }
                drawFood(ctx, food, world, now, now - foodBornAt.get(food), progress);
            }

            if (target) {
                drawTarget(ctx, target, now);
            }

            const lookAt = (snake) => nearestFood(world, snake, snake === me ? target : null);
            for (const snake of world.snakes) {
                if (snake.body.length) {
                    drawShadow(ctx, snakePoints(snake, progress));
                }
            }
            for (const snake of world.snakes) {
                if (!snake.isPlayer && snake.body.length) {
                    drawSnake(ctx, snake, snakePoints(snake, progress), snake.color, now, lookAt(snake));
                }
            }
            // Everyone else first, so your own snake and tag are always on top.
            for (const player of [...players.filter((snake) => snake !== me), ...(me ? [me] : [])]) {
                const points = snakePoints(player, progress);
                drawPlayer(ctx, world, player, points, now, lookAt(player));
                if (player.alive && points.length) {
                    const isMe = player === me;
                    drawNameTag(ctx, world, player, points[0], isMe ? youLabel() : player.name, now, isMe);
                }
            }

            particles = particles.filter((particle) => {
                particle.life -= particle.decay * elapsed;
                particle.x += particle.vx * elapsed;
                particle.y += particle.vy * elapsed;
                particle.vx *= 0.92;
                particle.vy *= 0.92;
                if (particle.life <= 0) {
                    return false;
                }
                ctx.globalAlpha = particle.life;
                circle(ctx, particle.x, particle.y, particle.size * particle.life, particle.color);
                return true;
            });
            ctx.globalAlpha = 1;

            rings = rings.filter((ring) => {
                const t = (now - ring.born) / ring.duration;
                if (t >= 1) {
                    return false;
                }
                ctx.globalAlpha = (1 - t) * 0.8;
                ctx.strokeStyle = ring.color;
                ctx.lineWidth = 3 * (1 - t) + 0.5;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.radius * easeOutCubic(t), 0, Math.PI * 2);
                ctx.stroke();
                return true;
            });
            ctx.globalAlpha = 1;

            ctx.font = POPUP_FONT;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            popups = popups.filter((popup) => {
                popup.life -= elapsed * 1.2;
                popup.y -= elapsed * 28;
                if (popup.life <= 0) {
                    return false;
                }
                ctx.globalAlpha = Math.min(1, popup.life * 2);
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.strokeText(popup.text, popup.x, popup.y);
                ctx.fillStyle = popup.color;
                ctx.fillText(popup.text, popup.x, popup.y);
                return true;
            });
            ctx.globalAlpha = 1;
            ctx.restore();

            if (players.some((player) => isEffectActive(world, 'slow', player))) {
                ctx.globalAlpha = 0.12 + Math.sin(now / 400) * 0.03;
                ctx.fillStyle = SLOW_TINT;
                ctx.fillRect(0, 0, width, height);
                ctx.globalAlpha = 1;
            }
            ctx.drawImage(vignette, 0, 0, width, height);

            if (now < flash.until) {
                ctx.globalAlpha = flash.strength * ((flash.until - now) / flash.duration);
                ctx.fillStyle = flash.color;
                ctx.fillRect(0, 0, width, height);
                ctx.globalAlpha = 1;
            }
        },
    };
}

/**
 * Pixel centers of every body segment, each sliding from its previous cell to its current one.
 */
function snakePoints(snake, progress) {
    const previous = snake.previousBody;

    return snake.body.map((cell, i) => {
        const from = previous?.[i] ?? cell;
        return {
            x: (from.x + (cell.x - from.x) * progress) * CELL + CELL / 2,
            y: (from.y + (cell.y - from.y) * progress) * CELL + CELL / 2,
        };
    });
}

/**
 * Where a snake's eyes look: the finger or mouse for the player, otherwise the closest food.
 */
function nearestFood(world, snake, target) {
    const head = snake.body[0];
    if (!head) {
        return null;
    }
    if (target) {
        return target;
    }
    let best = null;
    let bestDistance = Infinity;
    for (const food of world.foods) {
        const distance = Math.abs(food.x - head.x) + Math.abs(food.y - head.y);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = food;
        }
    }
    return best;
}

/**
 * Body thickness: full near the head, thinner toward the tail, with a pointed tip.
 */
function segmentRadius(i, length) {
    const base = CELL * 0.44 * (1 - (i / Math.max(length, 6)) * 0.45);
    const tip = i === length - 1 ? 0.5 : i === length - 2 ? 0.78 : 1;
    return base * tip;
}

function drawShadow(ctx, points) {
    ctx.save();
    ctx.translate(2, 4);
    ctx.globalAlpha = 0.3;
    strokeLine(ctx, points, segmentRadius(points.length / 2, points.length) * 2, '#000000');
    ctx.restore();
}

/**
 * The player, plus whichever power-ups are running: see-through as a ghost (or blinking
 * just after a shield broke), a bubble for the shield, and pulses for the magnet.
 */
function drawPlayer(ctx, world, player, points, now, lookAt) {
    if (!points.length) {
        return;
    }
    const alive = player.alive;
    const head = points[0];

    if (alive && isEffectActive(world, 'magnet', player)) {
        for (let i = 0; i < 2; i++) {
            const t = (now / 900 + i / 2) % 1;
            ctx.globalAlpha = (1 - t) * 0.45;
            ctx.strokeStyle = MAGNET_COLOR;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(head.x, head.y, CELL * (2.4 - t * 1.8), 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    let alpha = 1;
    if (alive && isEffectActive(world, 'ghost', player)) {
        alpha = 0.42 + Math.sin(now / 160) * 0.08;
    } else if (alive && isEffectActive(world, 'grace', player)) {
        alpha = Math.floor(now / 90) % 2 ? 0.35 : 0.9;
    }

    drawSnake(ctx, player, points, alive ? player.color : DEAD_COLOR, now, lookAt, alpha);

    if (alive && isEffectActive(world, 'shield', player)) {
        const pulse = 1 + Math.sin(now / 220) * 0.06;
        const radius = CELL * 0.95 * pulse;
        const bubble = ctx.createRadialGradient(head.x - radius * 0.3, head.y - radius * 0.3, 1, head.x, head.y, radius);
        bubble.addColorStop(0, 'rgba(186, 230, 253, 0.05)');
        bubble.addColorStop(0.75, 'rgba(56, 189, 248, 0.12)');
        bubble.addColorStop(1, 'rgba(56, 189, 248, 0.35)');
        ctx.fillStyle = bubble;
        ctx.beginPath();
        ctx.arc(head.x, head.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = SHIELD_COLOR;
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        const spin = now / 500;
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(head.x, head.y, radius - 2, spin, spin + 0.9);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

/**
 * A name tag pointing at a player's head (below it when the head is near the top wall): "YOU" on
 * your own snake, the player's name on others. Yours also pulses rings for a few seconds after it appears.
 */
function drawNameTag(ctx, world, snake, head, text, now, isMe) {
    const intro = isMe ? Math.max(0, 1 - (world.time - (snake.spawnedAt ?? 0)) / INTRO_MS) : 0;
    const tagColor = isMe && !world.multiplayer ? YOU_COLOR : snake.color;
    const width = world.cols * CELL;

    for (let i = 0; intro > 0 && i < 2; i++) {
        const t = (now / 750 + i / 2) % 1;
        ctx.globalAlpha = intro * (1 - t) * 0.85;
        ctx.strokeStyle = tagColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(head.x, head.y, CELL * (0.9 + t * 2.4), 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.font = TAG_FONT;
    const tagWidth = ctx.measureText(text).width + CELL;
    const tagHeight = CELL * 1.3;
    const below = head.y < CELL * 2.6;
    const bounce = Math.sin(now / 160) * 2.5 * intro;
    const cy = head.y + (below ? CELL * 1.6 : -CELL * 1.6) + bounce * (below ? 1 : -1);
    const cx = Math.min(Math.max(head.x, tagWidth / 2 + 2), width - tagWidth / 2 - 2);
    const tipY = cy + (below ? -tagHeight / 2 - 4 : tagHeight / 2 + 4);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#052e16';
    ctx.strokeStyle = tagColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - tagWidth / 2, cy - tagHeight / 2, tagWidth, tagHeight, tagHeight / 2);
    ctx.moveTo(head.x - 4, below ? cy - tagHeight / 2 : cy + tagHeight / 2);
    ctx.lineTo(head.x, tipY);
    ctx.lineTo(head.x + 4, below ? cy - tagHeight / 2 : cy + tagHeight / 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#dcfce7';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
}

function drawSnake(ctx, snake, points, color, now, lookAt, opacity = 1) {
    if (!points.length) {
        return;
    }

    const outline = mix(color, '#000000', 0.62);
    const dark = mix(color, '#000000', 0.4);
    const light = mix(color, '#ffffff', 0.45);
    const length = points.length;

    // A dark rim under the whole body, then the body itself, thinning and darkening toward the tail.
    ctx.globalAlpha = opacity;
    strokeTube(ctx, points, () => outline, 2.4);
    strokeTube(ctx, points, (i) => mix(color, dark, (i / length) * 0.8), 0);

    // Diamond scales along the back, alternating light and dark.
    for (let i = 1; i < length; i++) {
        const angle = Math.atan2(points[i - 1].y - points[i].y, points[i - 1].x - points[i].x);
        const size = segmentRadius(i, length) * 0.62;
        ctx.globalAlpha = (i % 2 ? 0.5 : 0.55) * opacity;
        diamond(ctx, points[i].x, points[i].y, size * 1.2, size * 0.85, angle, i % 2 ? dark : light);
    }

    // A soft sheen along the top of the body.
    ctx.globalAlpha = 0.22 * opacity;
    ctx.save();
    ctx.translate(-1.2, -1.8);
    strokeLine(ctx, points.slice(0, -1), segmentRadius(length / 2, length) * 0.55, '#ffffff');
    ctx.restore();

    ctx.globalAlpha = opacity;
    drawHead(ctx, snake, points, color, light, outline, now, lookAt, opacity);
    ctx.globalAlpha = 1;
}

/**
 * Stroke round-capped segments through the body centers. `extra` widens every segment (for the rim).
 */
function strokeTube(ctx, points, colorAt, extra) {
    const length = points.length;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (length === 1) {
        circle(ctx, points[0].x, points[0].y, segmentRadius(0, 1) + extra / 2, colorAt(0));
        return;
    }
    for (let i = length - 1; i >= 1; i--) {
        ctx.strokeStyle = colorAt(i);
        ctx.lineWidth = segmentRadius(i, length) * 2 + extra;
        ctx.beginPath();
        ctx.moveTo(points[i].x, points[i].y);
        ctx.lineTo(points[i - 1].x, points[i - 1].y);
        ctx.stroke();
    }
}

/**
 * Stroke one even-width line through the points; used for see-through layers so overlaps don't darken.
 */
function strokeLine(ctx, points, lineWidth, color) {
    if (points.length < 2) {
        return;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
        ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
}

function drawHead(ctx, snake, points, color, light, outline, now, lookAt, opacity) {
    const head = points[0];
    const dir = snake.dir;
    const radius = CELL * 0.52;
    const angle = Math.atan2(dir.y, dir.x);

    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(angle);

    const flick = (now / 1000 + snake.id * 0.37) % 2.2;
    if (snake.alive && flick < 0.3) {
        const reach = Math.sin((flick / 0.3) * Math.PI) * CELL * 0.45;
        ctx.strokeStyle = TONGUE_COLOR;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(radius * 0.8, 0);
        ctx.lineTo(radius * 0.8 + reach, 0);
        ctx.lineTo(radius * 0.8 + reach + 3, -2.5);
        ctx.moveTo(radius * 0.8 + reach, 0);
        ctx.lineTo(radius * 0.8 + reach + 3, 2.5);
        ctx.stroke();
    }

    if (snake.isPlayer && snake.alive) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
    }
    ctx.fillStyle = outline;
    ctx.beginPath();
    ctx.ellipse(radius * 0.1, 0, radius * 1.08 + 1.2, radius * 0.92 + 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const gradient = ctx.createRadialGradient(-radius * 0.2, -radius * 0.35, 1, 0, 0, radius * 1.1);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(radius * 0.1, 0, radius * 1.08, radius * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nostrils.
    ctx.globalAlpha = 0.55 * opacity;
    circle(ctx, radius * 0.92, -radius * 0.2, radius * 0.07, outline);
    circle(ctx, radius * 0.92, radius * 0.2, radius * 0.07, outline);
    ctx.globalAlpha = opacity;

    // Pupils turn toward what the snake is looking at; every few seconds it blinks.
    const look = lookDirection(head, lookAt, angle);
    const isBlinking = (now / 1000 + snake.id * 1.37) % 4.2 < 0.13;

    for (const side of [-1, 1]) {
        const ex = radius * 0.35;
        const ey = side * radius * 0.45;

        if (!snake.alive) {
            ctx.strokeStyle = '#111827';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(ex - 2.8, ey - 2.8);
            ctx.lineTo(ex + 2.8, ey + 2.8);
            ctx.moveTo(ex + 2.8, ey - 2.8);
            ctx.lineTo(ex - 2.8, ey + 2.8);
            ctx.stroke();
            continue;
        }

        if (isBlinking) {
            ctx.strokeStyle = outline;
            ctx.lineWidth = 1.6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(ex - radius * 0.3, ey);
            ctx.lineTo(ex + radius * 0.3, ey);
            ctx.stroke();
            continue;
        }

        circle(ctx, ex, ey, radius * 0.38, outline);
        circle(ctx, ex, ey, radius * 0.34, '#ffffff');
        circle(ctx, ex + look.x * radius * 0.13, ey + look.y * radius * 0.13, radius * 0.2, '#0f172a');
        circle(ctx, ex + look.x * radius * 0.13 - radius * 0.07, ey + look.y * radius * 0.13 - radius * 0.08, radius * 0.07, '#ffffff');
    }

    ctx.globalAlpha = 0.35 * opacity;
    circle(ctx, radius * 0.1, -radius * 0.78, radius * 0.16, '#fb7185');
    circle(ctx, radius * 0.1, radius * 0.78, radius * 0.16, '#fb7185');
    ctx.globalAlpha = 1;

    ctx.restore();
}

/**
 * The direction from the head to what it looks at, in the head's own rotated frame (unit length).
 */
function lookDirection(head, lookAt, angle) {
    if (!lookAt) {
        return { x: 1, y: 0 };
    }
    const dx = lookAt.x * CELL + CELL / 2 - head.x;
    const dy = lookAt.y * CELL + CELL / 2 - head.y;
    const length = Math.hypot(dx, dy) || 1;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return { x: (dx * cos - dy * sin) / length, y: (dx * sin + dy * cos) / length };
}

function drawFood(ctx, food, world, now, age, progress) {
    const from = food.from ?? food;
    const cx = (from.x + (food.x - from.x) * progress) * CELL + CELL / 2;
    const cy = (from.y + (food.y - from.y) * progress) * CELL + CELL / 2;
    const pop = Math.min(1, age / 250);
    const grow = pop < 1 ? Math.max(easeOutBack(pop), 0.01) : 1;

    if (food.kind === 'power') {
        drawPowerUp(ctx, food, world, now, cx, cy, grow);
        return;
    }

    if (food.kind === 'fruit') {
        const isExpiring = food.expiresAt - world.time < 2500;
        if (isExpiring && Math.floor(now / 140) % 2 === 0) {
            return;
        }
        const bob = Math.sin(now / 260 + food.x) * 2;

        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(cx, cy + CELL * 0.42, CELL * 0.32 * grow, CELL * 0.1 * grow, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.22 + Math.sin(now / 300 + food.y) * 0.08;
        circle(ctx, cx, cy + bob, CELL * 0.75 * grow, '#fde68a');
        ctx.globalAlpha = 1;

        ctx.save();
        ctx.translate(cx, cy - 1 + bob);
        ctx.scale(grow, grow);
        ctx.font = EMOJI_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(food.emoji, 0, 1);
        ctx.restore();

        const sparkle = (now / 700 + food.x * 0.3) % 1;
        ctx.globalAlpha = 1 - sparkle;
        drawSparkle(ctx, cx + CELL * 0.45, cy - CELL * 0.45 + bob, 3.5 * (1 - sparkle) + 1);
        ctx.globalAlpha = 1;
        return;
    }

    const color = food.kind === 'drop' ? food.color : FOOD_COLOR;
    const size = (food.kind === 'drop' ? 0.2 : 0.26) * CELL * grow;
    const pulse = 1 + Math.sin(now / 250 + food.x * 3 + food.y) * 0.15;

    ctx.globalAlpha = 0.18;
    circle(ctx, cx, cy, size * 2.4 * pulse, color);
    ctx.globalAlpha = 1;

    const gradient = ctx.createRadialGradient(cx - size * 0.35, cy - size * 0.35, 0.5, cx, cy, size);
    gradient.addColorStop(0, FOOD_CORE);
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * A power-up: a dark glass orb with its icon, a colored glow, and two rings spinning around it.
 */
function drawPowerUp(ctx, food, world, now, cx, cy, grow) {
    if (food.expiresAt - world.time < 2500 && Math.floor(now / 140) % 2 === 0) {
        return;
    }
    const { color, emoji } = food.powerUp;
    const bob = Math.sin(now / 300 + food.x) * 1.5;
    const pulse = 1 + Math.sin(now / 240) * 0.1;
    const y = cy + bob;

    ctx.globalAlpha = 0.28;
    circle(ctx, cx, y, CELL * 1.05 * pulse * grow, color);
    ctx.globalAlpha = 0.9;
    circle(ctx, cx, y, CELL * 0.5 * grow, '#0b1712');
    ctx.globalAlpha = 1;

    const spin = now / 380;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const offset of [0, Math.PI]) {
        ctx.beginPath();
        ctx.arc(cx, y, CELL * 0.62 * grow, spin + offset, spin + offset + 1.6);
        ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(grow, grow);
    ctx.font = ORB_EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);
    ctx.restore();
}

/**
 * A soft pulsing ring where the mouse or finger is steering the snake.
 */
function drawTarget(ctx, target, now) {
    const cx = target.x * CELL + CELL / 2;
    const cy = target.y * CELL + CELL / 2;
    const pulse = (now / 900) % 1;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.45 * (1 - pulse);
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * (0.45 + pulse * 0.6), 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.6;
    circle(ctx, cx, cy, 2, '#ffffff');
    ctx.globalAlpha = 1;
}

/**
 * Fireflies drifting slowly over the grass, twinkling on and off.
 */
function drawFireflies(ctx, width, height, now) {
    for (let i = 0; i < FIREFLIES; i++) {
        const seed = i * 97.13;
        const drift = ((seed * 7.1) % 1) * width + Math.sin(now / 5200 + seed) * 60 + (now / 180) * ((i % 3) - 1);
        const x = ((drift % width) + width) % width;
        const y = ((seed * 3.7) % 1) * height + Math.sin(now / 3900 + seed * 1.7) * 40;
        const glow = Math.max(0, Math.sin(now / 900 + seed * 2.3));
        ctx.globalAlpha = glow * 0.18;
        circle(ctx, x, y, 6, '#fef08a');
        ctx.globalAlpha = glow * 0.8;
        circle(ctx, x, y, 1.3, '#fefce8');
    }
    ctx.globalAlpha = 1;
}

function drawSparkle(ctx, x, y, size) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x, y, x + size, y);
    ctx.quadraticCurveTo(x, y, x, y + size);
    ctx.quadraticCurveTo(x, y, x - size, y);
    ctx.quadraticCurveTo(x, y, x, y - size);
    ctx.fill();
}

/**
 * The grass board is drawn once: a lit center, soft mottled patches, a faint checker,
 * grass tufts, pebbles and flowers, and shaded edges so the walls read as walls.
 */
function drawBoard(cols, rows, scale) {
    const width = cols * CELL;
    const height = rows * CELL;
    const board = document.createElement('canvas');
    board.width = width * scale;
    board.height = height * scale;

    const ctx = board.getContext('2d');
    ctx.scale(scale, scale);

    const light = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.5, width * 0.7);
    light.addColorStop(0, '#22532f');
    light.addColorStop(1, '#0c1f14');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);

    const random = seededRandom(7);
    for (let i = 0; i < 22; i++) {
        const x = random() * width;
        const y = random() * height;
        const radius = CELL * (3 + random() * 5);
        const patch = ctx.createRadialGradient(x, y, 0, x, y, radius);
        patch.addColorStop(0, i % 2 ? 'rgba(74, 140, 80, 0.16)' : 'rgba(3, 16, 9, 0.22)');
        patch.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = patch;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.026)';
    for (let y = 0; y < rows; y++) {
        for (let x = y % 2; x < cols; x += 2) {
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
    }

    const blades = ['134, 239, 172', '74, 222, 128', '190, 242, 100'];
    ctx.lineCap = 'round';
    for (let i = 0; i < 230; i++) {
        const x = random() * width;
        const y = random() * height;
        ctx.strokeStyle = `rgba(${blades[i % blades.length]}, ${0.05 + random() * 0.09})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const lean of [-2, 0, 2]) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + lean + (random() - 0.5), y - 3 - random() * 3);
        }
        ctx.stroke();
    }

    for (let i = 0; i < 34; i++) {
        const x = random() * width;
        const y = random() * height;
        const size = 1.2 + random() * 1.8;
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#04100a';
        ctx.beginPath();
        ctx.ellipse(x + 0.6, y + 0.8, size * 1.3, size, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath();
        ctx.ellipse(x, y, size * 1.3, size, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const petals = ['#fda4af', '#fde68a', '#c4b5fd', '#ffffff'];
    for (let i = 0; i < 26; i++) {
        const x = random() * width;
        const y = random() * height;
        ctx.globalAlpha = 0.18 + random() * 0.12;
        for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2;
            circle(ctx, x + Math.cos(angle) * 1.8, y + Math.sin(angle) * 1.8, 1.4, petals[i % petals.length]);
        }
        circle(ctx, x, y, 1, '#facc15');
    }
    ctx.globalAlpha = 1;

    // The walls: a shadow falling inward from every edge, and a thin lit rim.
    const edge = CELL * 0.9;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 0, 0, edge, 0, 0, width, edge],
        [0, height, 0, height - edge, 0, height - edge, width, edge],
        [0, 0, edge, 0, 0, 0, edge, height],
        [width, 0, width - edge, 0, width - edge, 0, edge, height],
    ]) {
        const shade = ctx.createLinearGradient(x0, y0, x1, y1);
        shade.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shade;
        ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.strokeStyle = 'rgba(187, 247, 208, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1.5, 1.5, width - 3, height - 3);

    return board;
}

function drawVignette(width, height, scale) {
    const vignette = document.createElement('canvas');
    vignette.width = width * scale;
    vignette.height = height * scale;

    const ctx = vignette.getContext('2d');
    ctx.scale(scale, scale);
    const gradient = ctx.createRadialGradient(width / 2, height / 2, height * 0.45, width / 2, height / 2, width * 0.72);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return vignette;
}

function circle(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(radius, 0), 0, Math.PI * 2);
    ctx.fill();
}

/**
 * A diamond (rhombus) centered on x, y, pointing along `angle`.
 */
function diamond(ctx, x, y, long, wide, angle, color) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + cos * long, y + sin * long);
    ctx.lineTo(x - sin * wide, y + cos * wide);
    ctx.lineTo(x - cos * long, y - sin * long);
    ctx.lineTo(x + sin * wide, y - cos * wide);
    ctx.closePath();
    ctx.fill();
}

/**
 * Blend two #rrggbb colors; amount 0 gives the first, 1 the second.
 */
function mix(from, to, amount) {
    const a = parseInt(from.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const channel = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * amount);
    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

function easeOutBack(t) {
    const overshoot = 1.7;
    return 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}

function seededRandom(seed) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}
