import { CELL } from './config.js';

const FOOD_COLOR = '#facc15';
const FOOD_CORE = '#fef9c3';
const DEAD_COLOR = '#6b7280';
const TONGUE_COLOR = '#f43f5e';
const EMOJI_FONT = `${Math.round(CELL * 1.05)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
const POPUP_FONT = `700 ${Math.round(CELL * 0.8)}px Fredoka, ui-sans-serif, system-ui, sans-serif`;

/**
 * Draws the world onto a canvas. The canvas keeps a fixed pixel size and CSS scales it to fit.
 * Snakes glide between cells: `progress` (0–1) says how far the current move has gone.
 */
export function createRenderer(canvas, cols, rows) {
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
    let popups = [];
    let lastNow = performance.now();
    let lastProgress = 1;

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

    function runEffect(event) {
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
        } else {
            burst(x, y, event.snake.color, 28, 130);
            burst(x, y, '#ffffff', 8, 80);
        }
    }

    return {
        /**
         * Show an effect once the gliding snake visually reaches the spot where it happened.
         */
        showEvent(event, delayMs) {
            pending.push({ event, runAt: performance.now() + (event.type === 'playerDied' ? 0 : delayMs) });
        },

        draw(world, now, progress, target = null) {
            const elapsed = Math.min((now - lastNow) / 1000, 0.1);
            lastNow = now;
            lastProgress = progress;

            pending = pending.filter((effect) => {
                if (now < effect.runAt) {
                    return true;
                }
                runEffect(effect.event);
                return false;
            });
            const soonEaten = pending.map((effect) => effect.event.food).filter(Boolean);

            ctx.drawImage(board, 0, 0, width, height);

            for (const food of [...world.foods, ...soonEaten]) {
                if (!foodBornAt.has(food)) {
                    foodBornAt.set(food, now);
                }
                drawFood(ctx, food, world, now, now - foodBornAt.get(food));
            }

            if (target) {
                drawTarget(ctx, target, now);
            }

            for (const snake of world.snakes) {
                if (snake.body.length) {
                    drawShadow(ctx, snakePoints(snake, lastProgress));
                }
            }
            for (const snake of world.snakes) {
                if (!snake.isPlayer && snake.body.length) {
                    drawSnake(ctx, snake, snakePoints(snake, lastProgress), snake.color, now);
                }
            }
            const player = world.snakes[0];
            drawSnake(ctx, player, snakePoints(player, lastProgress), player.alive ? player.color : DEAD_COLOR, now);

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

            ctx.drawImage(vignette, 0, 0, width, height);
        },
    };
}

/**
 * Pixel centers of every body segment, each sliding from its previous cell to its current one.
 */
function snakePoints(snake, progress) {
    const previous = snake.previousBody;
    const t = progress;

    return snake.body.map((cell, i) => {
        const from = previous?.[i] ?? cell;
        return {
            x: (from.x + (cell.x - from.x) * t) * CELL + CELL / 2,
            y: (from.y + (cell.y - from.y) * t) * CELL + CELL / 2,
        };
    });
}

function segmentRadius(i, length) {
    return CELL * 0.44 * (1 - (i / Math.max(length, 6)) * 0.5);
}

function drawShadow(ctx, points) {
    ctx.save();
    ctx.translate(2, 4);
    ctx.globalAlpha = 0.3;
    strokeLine(ctx, points, segmentRadius(points.length / 2, points.length) * 2, '#000000');
    ctx.restore();
}

function drawSnake(ctx, snake, points, color, now) {
    if (!points.length) {
        return;
    }

    const dark = mix(color, '#000000', 0.45);
    const light = mix(color, '#ffffff', 0.45);
    const length = points.length;

    strokeTube(ctx, points, (i) => mix(color, dark, i / length), 1);

    ctx.globalAlpha = 0.9;
    for (let i = 2; i < length; i += 2) {
        circle(ctx, points[i].x, points[i].y, segmentRadius(i, length) * 0.38, i % 4 ? light : dark);
    }

    ctx.globalAlpha = 0.25;
    ctx.save();
    ctx.translate(-1.2, -1.8);
    strokeLine(ctx, points.slice(0, -1), segmentRadius(length / 2, length) * 0.7, '#ffffff');
    ctx.restore();
    ctx.globalAlpha = 1;

    drawHead(ctx, snake, points, color, light, now);
}

/**
 * Stroke a round-capped line through the segment centers, thinning toward the tail.
 */
function strokeTube(ctx, points, colorAt, widthFactor) {
    const length = points.length;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = length - 1; i >= 1; i--) {
        ctx.strokeStyle = colorAt(i);
        ctx.lineWidth = segmentRadius(i, length) * 2 * widthFactor;
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

function drawHead(ctx, snake, points, color, light, now) {
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
    const gradient = ctx.createRadialGradient(-radius * 0.2, -radius * 0.35, 1, 0, 0, radius * 1.1);
    gradient.addColorStop(0, light);
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(radius * 0.1, 0, radius * 1.08, radius * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

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

        circle(ctx, ex, ey, radius * 0.36, '#ffffff');
        circle(ctx, ex + radius * 0.1, ey, radius * 0.2, '#0f172a');
        circle(ctx, ex + radius * 0.02, ey - radius * 0.1, radius * 0.08, '#ffffff');
    }

    ctx.globalAlpha = 0.35;
    circle(ctx, radius * 0.1, -radius * 0.78, radius * 0.16, '#fb7185');
    circle(ctx, radius * 0.1, radius * 0.78, radius * 0.16, '#fb7185');
    ctx.globalAlpha = 1;

    ctx.restore();
}

function drawFood(ctx, food, world, now, age) {
    const cx = food.x * CELL + CELL / 2;
    const cy = food.y * CELL + CELL / 2;
    const pop = Math.min(1, age / 250);
    const grow = pop < 1 ? Math.max(easeOutBack(pop), 0.01) : 1;

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
 * The grass board is drawn once: a lit center, a soft checker, and scattered grass and flowers.
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
    light.addColorStop(0, '#1f4a2e');
    light.addColorStop(1, '#0d2016');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.028)';
    for (let y = 0; y < rows; y++) {
        for (let x = y % 2; x < cols; x += 2) {
            ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
    }

    const random = seededRandom(7);
    ctx.lineCap = 'round';
    for (let i = 0; i < 140; i++) {
        const x = random() * width;
        const y = random() * height;
        ctx.strokeStyle = `rgba(134, 239, 172, ${0.05 + random() * 0.08})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const lean of [-2, 0, 2]) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + lean + (random() - 0.5), y - 3 - random() * 3);
        }
        ctx.stroke();
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

function seededRandom(seed) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}
