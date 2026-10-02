import { BlurStyle, PaintStyle, Skia, StrokeCap, StrokeJoin, TextAlign, TileMode } from '@shopify/react-native-skia';

import { CELL, isEffectActive } from './shared';

// A Skia port of resources/js/snake/renderer.js. Drawing happens in board units (CELL px per cell)
// and is scaled to whatever size the board has on screen. The field can be wide or upright.
const FOOD_COLOR = '#facc15';
const FOOD_CORE = '#fef9c3';
const DEAD_COLOR = '#6b7280';
const TONGUE_COLOR = '#f43f5e';
const SHIELD_COLOR = '#38bdf8';
const MAGNET_COLOR = '#f472b6';
const SLOW_TINT = '#8b5cf6';
const FIREFLIES = 14;
const YOU_COLOR = '#4ade80';
/** How long the rings around the player's head pulse at the start of a game. */
const INTRO_MS = 3500;

const fill = Skia.Paint();
fill.setAntiAlias(true);
const stroke = Skia.Paint();
stroke.setAntiAlias(true);
stroke.setStyle(PaintStyle.Stroke);
stroke.setStrokeCap(StrokeCap.Round);
stroke.setStrokeJoin(StrokeJoin.Round);

function paint(base, color, alpha = 1) {
    base.setShader(null);
    base.setMaskFilter(null);
    base.setColor(Skia.Color(color));
    base.setAlphaf(Math.max(0, Math.min(1, alpha)));
    return base;
}

function line(color, width, alpha = 1) {
    const linePaint = paint(stroke, color, alpha);
    linePaint.setStrokeWidth(width);
    return linePaint;
}

function circle(canvas, x, y, radius, color, alpha = 1) {
    canvas.drawCircle(x, y, Math.max(radius, 0), paint(fill, color, alpha));
}

function oval(canvas, cx, cy, rx, ry, drawPaint) {
    canvas.drawOval(Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2), drawPaint);
}

function ring(canvas, x, y, radius, drawPaint) {
    canvas.drawCircle(x, y, Math.max(radius, 0), drawPaint);
}

/** An arc of a circle, in radians like the web canvas version. */
function arc(canvas, x, y, radius, start, end, drawPaint) {
    const degrees = 180 / Math.PI;
    canvas.drawArc(Skia.XYWHRect(x - radius, y - radius, radius * 2, radius * 2), start * degrees, (end - start) * degrees, false, drawPaint);
}

function radial(x0, y0, r0, x1, y1, r1, colors, positions = null) {
    return Skia.Shader.MakeTwoPointConicalGradient(
        { x: x0, y: y0 },
        r0,
        { x: x1, y: y1 },
        r1,
        colors.map((color) => Skia.Color(color)),
        positions,
        TileMode.Clamp,
    );
}

/**
 * `label(powerUp)` gives a power-up's name in the player's language.
 */
export function createRenderer({ label = (powerUp) => powerUp.label, youLabel = () => 'YOU' } = {}) {
    const backdrops = new Map();
    /** The grass and vignette are drawn once per field shape. */
    function backdrop(cols, rows) {
        const key = `${cols}x${rows}`;
        if (!backdrops.has(key)) {
            backdrops.set(key, { board: drawBoard(cols, rows), vignette: drawVignette(cols, rows) });
        }
        return backdrops.get(key);
    }
    const foodBornAt = new WeakMap();
    const paragraphs = new Map();
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

    /**
     * Text (fruit and power-up emoji, "+5" popups) is laid out once per string and reused every frame.
     * Phones use their system fonts; where none are available (the web preview) text is skipped.
     */
    function paragraph(text, fontSize, color) {
        const key = `${text}|${fontSize}|${color}`;
        if (!paragraphs.has(key)) {
            paragraphs.set(key, buildParagraph(text, fontSize, color));
        }
        return paragraphs.get(key);
    }

    function buildParagraph(text, fontSize, color) {
        try {
            const built = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center })
                .pushStyle({
                    color: Skia.Color(color),
                    fontSize,
                    fontStyle: { weight: 700 },
                    shadows: [{ color: Skia.Color('rgba(0, 0, 0, 0.7)'), blurRadius: 2, offset: { x: 0, y: 1 } }],
                })
                .addText(text)
                .pop()
                .build();
            built.layout(CELL * 6);
            return built;
        } catch {
            return null;
        }
    }

    /**
     * Returns false when the text could not be drawn.
     */
    function drawCenteredText(canvas, text, fontSize, color, x, y, alpha = 1) {
        const para = paragraph(text, fontSize, color);
        if (!para) {
            return false;
        }
        if (alpha < 1) {
            canvas.saveLayer(paint(fill, '#000000', alpha));
        }
        para.paint(canvas, x - CELL * 3, y - para.getHeight() / 2);
        if (alpha < 1) {
            canvas.restore();
        }
        return true;
    }

    function drawFood(canvas, food, world, now, age, progress) {
        const from = food.from ?? food;
        const cx = (from.x + (food.x - from.x) * progress) * CELL + CELL / 2;
        const cy = (from.y + (food.y - from.y) * progress) * CELL + CELL / 2;
        const pop = Math.min(1, age / 250);
        const grow = pop < 1 ? Math.max(easeOutBack(pop), 0.01) : 1;

        if (food.kind === 'power') {
            drawPowerUp(canvas, food, world, now, cx, cy, grow);
            return;
        }

        if (food.kind === 'fruit') {
            const isExpiring = food.expiresAt - world.time < 2500;
            if (isExpiring && Math.floor(now / 140) % 2 === 0) {
                return;
            }
            const bob = Math.sin(now / 260 + food.x) * 2;

            oval(canvas, cx, cy + CELL * 0.42, CELL * 0.32 * grow, CELL * 0.1 * grow, paint(fill, '#000000', 0.3));
            circle(canvas, cx, cy + bob, CELL * 0.75 * grow, '#fde68a', 0.22 + Math.sin(now / 300 + food.y) * 0.08);

            canvas.save();
            canvas.translate(cx, cy - 1 + bob);
            canvas.scale(grow, grow);
            if (!drawCenteredText(canvas, food.emoji, CELL * 0.95, '#ffffff', 0, 1)) {
                circle(canvas, 0, 1, CELL * 0.38, '#fb7185');
                circle(canvas, -CELL * 0.12, -CELL * 0.1, CELL * 0.1, '#fecdd3');
            }
            canvas.restore();

            const sparkle = (now / 700 + food.x * 0.3) % 1;
            drawSparkle(canvas, cx + CELL * 0.45, cy - CELL * 0.45 + bob, 3.5 * (1 - sparkle) + 1, 1 - sparkle);
            return;
        }

        const color = food.kind === 'drop' ? food.color : FOOD_COLOR;
        const size = (food.kind === 'drop' ? 0.2 : 0.26) * CELL * grow;
        const pulse = 1 + Math.sin(now / 250 + food.x * 3 + food.y) * 0.15;

        circle(canvas, cx, cy, size * 2.4 * pulse, color, 0.18);
        const gradient = paint(fill, '#ffffff');
        gradient.setShader(radial(cx - size * 0.35, cy - size * 0.35, 0.5, cx, cy, size, [FOOD_CORE, color]));
        canvas.drawCircle(cx, cy, size, gradient);
    }

    /**
     * A power-up: a dark glass orb with its icon, a colored glow, and two rings spinning around it.
     */
    function drawPowerUp(canvas, food, world, now, cx, cy, grow) {
        if (food.expiresAt - world.time < 2500 && Math.floor(now / 140) % 2 === 0) {
            return;
        }
        const { color, emoji } = food.powerUp;
        const bob = Math.sin(now / 300 + food.x) * 1.5;
        const pulse = 1 + Math.sin(now / 240) * 0.1;
        const y = cy + bob;

        circle(canvas, cx, y, CELL * 1.05 * pulse * grow, color, 0.28);
        circle(canvas, cx, y, CELL * 0.5 * grow, '#0b1712', 0.9);

        const spin = now / 380;
        for (const offset of [0, Math.PI]) {
            arc(canvas, cx, y, CELL * 0.62 * grow, spin + offset, spin + offset + 1.6, line(color, 2));
        }

        canvas.save();
        canvas.translate(cx, y);
        canvas.scale(grow, grow);
        if (!drawCenteredText(canvas, emoji, CELL * 0.6, '#ffffff', 0, 0)) {
            circle(canvas, 0, 0, CELL * 0.22, color);
        }
        canvas.restore();
    }

    /**
     * The player, plus whichever power-ups are running: see-through as a ghost (or blinking
     * just after a shield broke), a bubble for the shield, and pulses for the magnet.
     */
    /**
     * A name tag pointing at a player's head (below it when the head is near the top wall): "YOU" on
     * your own snake, the player's name on others. Yours also pulses rings for a few seconds after it appears.
     */
    function drawNameTag(canvas, world, snake, head, text, now, isMe) {
        const intro = isMe ? Math.max(0, 1 - (world.time - (snake.spawnedAt ?? 0)) / INTRO_MS) : 0;
        const tagColor = isMe && !world.multiplayer ? YOU_COLOR : snake.color;
        const width = world.cols * CELL;

        for (let i = 0; intro > 0 && i < 2; i++) {
            const t = (now / 750 + i / 2) % 1;
            ring(canvas, head.x, head.y, CELL * (0.9 + t * 2.4), line(tagColor, 2.5, intro * (1 - t) * 0.85));
        }

        const para = paragraph(text, CELL * 0.95, '#dcfce7');
        const tagWidth = (para ? para.getMaxIntrinsicWidth() : CELL * 1.5) + CELL;
        const tagHeight = CELL * 1.3;
        const below = head.y < CELL * 2.6;
        const bounce = Math.sin(now / 160) * 2.5 * intro;
        const cy = head.y + (below ? CELL * 1.6 : -CELL * 1.6) + bounce * (below ? 1 : -1);
        const cx = Math.min(Math.max(head.x, tagWidth / 2 + 2), width - tagWidth / 2 - 2);
        const edgeY = below ? cy - tagHeight / 2 : cy + tagHeight / 2;
        const tipY = below ? edgeY - 4 : edgeY + 4;

        const shape = Skia.PathBuilder.Make();
        shape.addRRect(Skia.RRectXY(Skia.XYWHRect(cx - tagWidth / 2, cy - tagHeight / 2, tagWidth, tagHeight), tagHeight / 2, tagHeight / 2));
        shape.moveTo(head.x - 4, edgeY);
        shape.lineTo(head.x, tipY);
        shape.lineTo(head.x + 4, edgeY);
        const outline = shape.build();
        canvas.drawPath(outline, paint(fill, '#052e16', 0.92));
        canvas.drawPath(outline, line(tagColor, 1.5));

        if (para) {
            para.paint(canvas, cx - CELL * 3, cy - para.getHeight() / 2);
        }
    }

    function drawPlayer(canvas, world, player, points, now, lookAt) {
        if (!points.length) {
            return;
        }
        const alive = player.alive;
        const head = points[0];

        if (alive && isEffectActive(world, 'magnet', player)) {
            for (let i = 0; i < 2; i++) {
                const t = (now / 900 + i / 2) % 1;
                ring(canvas, head.x, head.y, CELL * (2.4 - t * 1.8), line(MAGNET_COLOR, 1.5, (1 - t) * 0.45));
            }
        }

        let opacity = 1;
        if (alive && isEffectActive(world, 'ghost', player)) {
            opacity = 0.42 + Math.sin(now / 160) * 0.08;
        } else if (alive && isEffectActive(world, 'grace', player)) {
            opacity = Math.floor(now / 90) % 2 ? 0.35 : 0.9;
        }

        drawSnake(canvas, player, points, alive ? player.color : DEAD_COLOR, now, lookAt, opacity);

        if (alive && isEffectActive(world, 'shield', player)) {
            const radius = CELL * 0.95 * (1 + Math.sin(now / 220) * 0.06);
            const bubble = paint(fill, '#ffffff');
            bubble.setShader(
                radial(head.x - radius * 0.3, head.y - radius * 0.3, 1, head.x, head.y, radius, [
                    'rgba(186, 230, 253, 0.05)',
                    'rgba(56, 189, 248, 0.12)',
                    'rgba(56, 189, 248, 0.35)',
                ], [0, 0.75, 1]),
            );
            canvas.drawCircle(head.x, head.y, radius, bubble);
            ring(canvas, head.x, head.y, radius, line(SHIELD_COLOR, 1.6, 0.9));
            const spin = now / 500;
            arc(canvas, head.x, head.y, radius - 2, spin, spin + 0.9, line('#e0f2fe', 2, 0.9));
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

        /**
         * Record one frame as a Skia picture sized to the board on screen.
         */
        draw(world, now, progress, target, width, height) {
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

            const WIDTH = world.cols * CELL;
            const HEIGHT = world.rows * CELL;
            const { board, vignette } = backdrop(world.cols, world.rows);

            const recorder = Skia.PictureRecorder();
            const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
            canvas.scale(width / WIDTH, height / HEIGHT);
            canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), paint(fill, '#07100c'));

            canvas.save();
            if (now < shake.until) {
                const strength = shake.magnitude * ((shake.until - now) / shake.duration);
                canvas.translate((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength);
            }

            canvas.drawPicture(board);
            drawFireflies(canvas, now, WIDTH, HEIGHT);

            for (const food of [...world.foods, ...soonEaten]) {
                if (!foodBornAt.has(food)) {
                    foodBornAt.set(food, now);
                }
                drawFood(canvas, food, world, now, now - foodBornAt.get(food), progress);
            }

            if (target) {
                drawTarget(canvas, target, now);
            }

            const lookAt = (snake) => nearestFood(world, snake, snake === me ? target : null);
            for (const snake of world.snakes) {
                if (snake.body.length) {
                    drawShadow(canvas, snakePoints(snake, progress));
                }
            }
            for (const snake of world.snakes) {
                if (!snake.isPlayer && snake.body.length) {
                    drawSnake(canvas, snake, snakePoints(snake, progress), snake.color, now, lookAt(snake));
                }
            }
            // Everyone else first, so your own snake and tag are always on top.
            for (const player of [...players.filter((snake) => snake !== me), ...(me ? [me] : [])]) {
                const points = snakePoints(player, progress);
                drawPlayer(canvas, world, player, points, now, lookAt(player));
                if (player.alive && points.length) {
                    const isMe = player === me;
                    drawNameTag(canvas, world, player, points[0], isMe ? youLabel() : player.name, now, isMe);
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
                circle(canvas, particle.x, particle.y, particle.size * particle.life, particle.color, particle.life);
                return true;
            });

            rings = rings.filter((effect) => {
                const t = (now - effect.born) / effect.duration;
                if (t >= 1) {
                    return false;
                }
                ring(canvas, effect.x, effect.y, effect.radius * easeOutCubic(t), line(effect.color, 3 * (1 - t) + 0.5, (1 - t) * 0.8));
                return true;
            });

            popups = popups.filter((popup) => {
                popup.life -= elapsed * 1.2;
                popup.y -= elapsed * 28;
                if (popup.life <= 0) {
                    return false;
                }
                drawCenteredText(canvas, popup.text, CELL * 0.8, popup.color, popup.x, popup.y, Math.min(1, popup.life * 2));
                return true;
            });
            canvas.restore();

            if (players.some((player) => isEffectActive(world, 'slow', player))) {
                canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), paint(fill, SLOW_TINT, 0.12 + Math.sin(now / 400) * 0.03));
            }
            canvas.drawPicture(vignette);

            if (now < flash.until) {
                canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), paint(fill, flash.color, flash.strength * ((flash.until - now) / flash.duration)));
            }

            return recorder.finishRecordingAsPicture();
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
 * Where a snake's eyes look: the finger for the player, otherwise the closest food.
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

function drawShadow(canvas, points) {
    canvas.save();
    canvas.translate(2, 4);
    strokeLine(canvas, points, segmentRadius(points.length / 2, points.length) * 2, '#000000', 0.3);
    canvas.restore();
}

function drawSnake(canvas, snake, points, color, now, lookAt, opacity = 1) {
    if (!points.length) {
        return;
    }

    const outline = mix(color, '#000000', 0.62);
    const dark = mix(color, '#000000', 0.4);
    const light = mix(color, '#ffffff', 0.45);
    const length = points.length;

    // A dark rim under the whole body, then the body itself, thinning and darkening toward the tail.
    strokeTube(canvas, points, () => outline, 2.4, opacity);
    strokeTube(canvas, points, (i) => mix(color, dark, (i / length) * 0.8), 0, opacity);

    // Diamond scales along the back, alternating light and dark.
    for (let i = 1; i < length; i++) {
        const angle = Math.atan2(points[i - 1].y - points[i].y, points[i - 1].x - points[i].x);
        const size = segmentRadius(i, length) * 0.62;
        diamond(canvas, points[i].x, points[i].y, size * 1.2, size * 0.85, angle, i % 2 ? dark : light, (i % 2 ? 0.5 : 0.55) * opacity);
    }

    // A soft sheen along the top of the body.
    canvas.save();
    canvas.translate(-1.2, -1.8);
    strokeLine(canvas, points.slice(0, -1), segmentRadius(length / 2, length) * 0.55, '#ffffff', 0.22 * opacity);
    canvas.restore();

    drawHead(canvas, snake, points, color, light, outline, now, lookAt, opacity);
}

/**
 * Round-capped segments through the body centers. `extra` widens every segment (for the rim).
 */
function strokeTube(canvas, points, colorAt, extra, opacity) {
    const length = points.length;
    if (length === 1) {
        circle(canvas, points[0].x, points[0].y, segmentRadius(0, 1) + extra / 2, colorAt(0), opacity);
        return;
    }
    for (let i = length - 1; i >= 1; i--) {
        canvas.drawLine(points[i].x, points[i].y, points[i - 1].x, points[i - 1].y, line(colorAt(i), segmentRadius(i, length) * 2 + extra, opacity));
    }
}

/**
 * One even-width line through the points; used for see-through layers so overlaps don't darken.
 */
function strokeLine(canvas, points, lineWidth, color, alpha) {
    if (points.length < 2) {
        return;
    }
    const path = Skia.PathBuilder.Make();
    path.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
        path.lineTo(point.x, point.y);
    }
    canvas.drawPath(path.build(), line(color, lineWidth, alpha));
}

function drawHead(canvas, snake, points, color, light, outline, now, lookAt, opacity) {
    const head = points[0];
    const radius = CELL * 0.52;
    const radians = Math.atan2(snake.dir.y, snake.dir.x);

    canvas.save();
    canvas.translate(head.x, head.y);
    canvas.rotate((radians * 180) / Math.PI, 0, 0);

    const flick = (now / 1000 + snake.id * 0.37) % 2.2;
    if (snake.alive && flick < 0.3) {
        const reach = Math.sin((flick / 0.3) * Math.PI) * CELL * 0.45;
        const tip = radius * 0.8 + reach;
        const tongue = Skia.PathBuilder.Make();
        tongue.moveTo(radius * 0.8, 0);
        tongue.lineTo(tip, 0);
        tongue.lineTo(tip + 3, -2.5);
        tongue.moveTo(tip, 0);
        tongue.lineTo(tip + 3, 2.5);
        canvas.drawPath(tongue.build(), line(TONGUE_COLOR, 1.6, opacity));
    }

    if (snake.isPlayer && snake.alive) {
        const glow = paint(fill, color, 0.8 * opacity);
        glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true));
        oval(canvas, radius * 0.1, 0, radius * 1.08, radius * 0.92, glow);
    }
    oval(canvas, radius * 0.1, 0, radius * 1.08 + 1.2, radius * 0.92 + 1.2, paint(fill, outline, opacity));
    const headPaint = paint(fill, '#ffffff', opacity);
    headPaint.setShader(radial(-radius * 0.2, -radius * 0.35, 1, 0, 0, radius * 1.1, [light, color]));
    oval(canvas, radius * 0.1, 0, radius * 1.08, radius * 0.92, headPaint);

    // Nostrils.
    circle(canvas, radius * 0.92, -radius * 0.2, radius * 0.07, outline, 0.55 * opacity);
    circle(canvas, radius * 0.92, radius * 0.2, radius * 0.07, outline, 0.55 * opacity);

    // Pupils turn toward what the snake is looking at; every few seconds it blinks.
    const look = lookDirection(head, lookAt, radians);
    const isBlinking = (now / 1000 + snake.id * 1.37) % 4.2 < 0.13;

    for (const side of [-1, 1]) {
        const ex = radius * 0.35;
        const ey = side * radius * 0.45;

        if (!snake.alive) {
            const cross = line('#111827', 1.8, opacity);
            canvas.drawLine(ex - 2.8, ey - 2.8, ex + 2.8, ey + 2.8, cross);
            canvas.drawLine(ex + 2.8, ey - 2.8, ex - 2.8, ey + 2.8, cross);
            continue;
        }

        if (isBlinking) {
            canvas.drawLine(ex - radius * 0.3, ey, ex + radius * 0.3, ey, line(outline, 1.6, opacity));
            continue;
        }

        circle(canvas, ex, ey, radius * 0.38, outline, opacity);
        circle(canvas, ex, ey, radius * 0.34, '#ffffff', opacity);
        circle(canvas, ex + look.x * radius * 0.13, ey + look.y * radius * 0.13, radius * 0.2, '#0f172a', opacity);
        circle(canvas, ex + look.x * radius * 0.13 - radius * 0.07, ey + look.y * radius * 0.13 - radius * 0.08, radius * 0.07, '#ffffff', opacity);
    }

    circle(canvas, radius * 0.1, -radius * 0.78, radius * 0.16, '#fb7185', 0.35 * opacity);
    circle(canvas, radius * 0.1, radius * 0.78, radius * 0.16, '#fb7185', 0.35 * opacity);

    canvas.restore();
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

/**
 * A soft pulsing ring where the finger is steering the snake.
 */
function drawTarget(canvas, target, now) {
    const cx = target.x * CELL + CELL / 2;
    const cy = target.y * CELL + CELL / 2;
    const pulse = (now / 900) % 1;

    ring(canvas, cx, cy, CELL * 0.45, line('#ffffff', 1.5, 0.5));
    ring(canvas, cx, cy, CELL * (0.45 + pulse * 0.6), line('#ffffff', 1.5, 0.45 * (1 - pulse)));
    circle(canvas, cx, cy, 2, '#ffffff', 0.6);
}

/**
 * Fireflies drifting slowly over the grass, twinkling on and off.
 */
function drawFireflies(canvas, now, WIDTH, HEIGHT) {
    for (let i = 0; i < FIREFLIES; i++) {
        const seed = i * 97.13;
        const drift = ((seed * 7.1) % 1) * WIDTH + Math.sin(now / 5200 + seed) * 60 + (now / 180) * ((i % 3) - 1);
        const x = ((drift % WIDTH) + WIDTH) % WIDTH;
        const y = ((seed * 3.7) % 1) * HEIGHT + Math.sin(now / 3900 + seed * 1.7) * 40;
        const glow = Math.max(0, Math.sin(now / 900 + seed * 2.3));
        if (glow > 0) {
            circle(canvas, x, y, 6, '#fef08a', glow * 0.18);
            circle(canvas, x, y, 1.3, '#fefce8', glow * 0.8);
        }
    }
}

function drawSparkle(canvas, x, y, size, alpha) {
    const path = Skia.PathBuilder.Make();
    path.moveTo(x, y - size);
    path.quadTo(x, y, x + size, y);
    path.quadTo(x, y, x, y + size);
    path.quadTo(x, y, x - size, y);
    path.quadTo(x, y, x, y - size);
    canvas.drawPath(path.build(), paint(fill, '#ffffff', alpha));
}

/**
 * A diamond (rhombus) centered on x, y, pointing along `angle`.
 */
function diamond(canvas, x, y, long, wide, angle, color, alpha) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const path = Skia.PathBuilder.Make();
    path.moveTo(x + cos * long, y + sin * long);
    path.lineTo(x - sin * wide, y + cos * wide);
    path.lineTo(x - cos * long, y - sin * long);
    path.lineTo(x + sin * wide, y - cos * wide);
    path.close();
    canvas.drawPath(path.build(), paint(fill, color, alpha));
}

/**
 * The grass board is drawn once: a lit center, soft mottled patches, a faint checker,
 * grass tufts, pebbles and flowers, and shaded edges so the walls read as walls.
 */
function drawBoard(cols, rows) {
    const WIDTH = cols * CELL;
    const HEIGHT = rows * CELL;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, WIDTH, HEIGHT));

    const light = paint(fill, '#ffffff');
    light.setShader(radial(WIDTH * 0.5, HEIGHT * 0.4, 0, WIDTH * 0.5, HEIGHT * 0.5, Math.max(WIDTH, HEIGHT) * 0.7, ['#22532f', '#0c1f14']));
    canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), light);

    const random = seededRandom(7);
    for (let i = 0; i < 22; i++) {
        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        const radius = CELL * (3 + random() * 5);
        const patch = paint(fill, '#ffffff');
        patch.setShader(
            Skia.Shader.MakeRadialGradient(
                { x, y },
                radius,
                [Skia.Color(i % 2 ? 'rgba(74, 140, 80, 0.16)' : 'rgba(3, 16, 9, 0.22)'), Skia.Color('rgba(0, 0, 0, 0)')],
                null,
                TileMode.Clamp,
            ),
        );
        canvas.drawRect(Skia.XYWHRect(x - radius, y - radius, radius * 2, radius * 2), patch);
    }

    const checker = paint(fill, '#ffffff', 0.026);
    for (let y = 0; y < rows; y++) {
        for (let x = y % 2; x < cols; x += 2) {
            canvas.drawRect(Skia.XYWHRect(x * CELL, y * CELL, CELL, CELL), checker);
        }
    }

    const blades = ['#86efac', '#4ade80', '#bef264'];
    for (let i = 0; i < 230; i++) {
        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        const grass = line(blades[i % blades.length], 1, 0.05 + random() * 0.09);
        for (const lean of [-2, 0, 2]) {
            canvas.drawLine(x, y, x + lean + (random() - 0.5), y - 3 - random() * 3, grass);
        }
    }

    for (let i = 0; i < 34; i++) {
        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        const size = 1.2 + random() * 1.8;
        oval(canvas, x + 0.6, y + 0.8, size * 1.3, size, paint(fill, '#04100a', 0.35));
        oval(canvas, x, y, size * 1.3, size, paint(fill, '#9ca3af', 0.28));
    }

    const petals = ['#fda4af', '#fde68a', '#c4b5fd', '#ffffff'];
    for (let i = 0; i < 26; i++) {
        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        const alpha = 0.18 + random() * 0.12;
        for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2;
            circle(canvas, x + Math.cos(angle) * 1.8, y + Math.sin(angle) * 1.8, 1.4, petals[i % petals.length], alpha);
        }
        circle(canvas, x, y, 1, '#facc15', alpha);
    }

    // The walls: a shadow falling inward from every edge, and a thin lit rim.
    const edge = CELL * 0.9;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
        [0, 0, 0, edge, 0, 0, WIDTH, edge],
        [0, HEIGHT, 0, HEIGHT - edge, 0, HEIGHT - edge, WIDTH, edge],
        [0, 0, edge, 0, 0, 0, edge, HEIGHT],
        [WIDTH, 0, WIDTH - edge, 0, WIDTH - edge, 0, edge, HEIGHT],
    ]) {
        const shade = paint(fill, '#ffffff');
        shade.setShader(
            Skia.Shader.MakeLinearGradient(
                { x: x0, y: y0 },
                { x: x1, y: y1 },
                [Skia.Color('rgba(0, 0, 0, 0.45)'), Skia.Color('rgba(0, 0, 0, 0)')],
                null,
                TileMode.Clamp,
            ),
        );
        canvas.drawRect(Skia.XYWHRect(rx, ry, rw, rh), shade);
    }
    const rim = paint(stroke, '#bbf7d0', 0.08);
    rim.setStrokeWidth(1);
    canvas.drawRect(Skia.XYWHRect(1.5, 1.5, WIDTH - 3, HEIGHT - 3), rim);

    return recorder.finishRecordingAsPicture();
}

function drawVignette(cols, rows) {
    const WIDTH = cols * CELL;
    const HEIGHT = rows * CELL;
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, WIDTH, HEIGHT));
    const shade = paint(fill, '#ffffff');
    shade.setShader(
        radial(WIDTH / 2, HEIGHT / 2, Math.min(WIDTH, HEIGHT) * 0.45, WIDTH / 2, HEIGHT / 2, Math.max(WIDTH, HEIGHT) * 0.72, [
            'rgba(0, 0, 0, 0)',
            'rgba(0, 0, 0, 0.45)',
        ]),
    );
    canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), shade);
    return recorder.finishRecordingAsPicture();
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
