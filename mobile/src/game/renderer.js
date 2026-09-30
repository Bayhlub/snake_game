import { BlurStyle, PaintStyle, Skia, StrokeCap, StrokeJoin, TextAlign, TileMode } from '@shopify/react-native-skia';

import { CELL, COLS, ROWS } from './shared';

// A Skia port of resources/js/snake/renderer.js. Drawing happens in board units (CELL px per cell)
// and is scaled to whatever size the board has on screen.
const WIDTH = COLS * CELL;
const HEIGHT = ROWS * CELL;
const FOOD_COLOR = '#facc15';
const FOOD_CORE = '#fef9c3';
const DEAD_COLOR = '#6b7280';
const TONGUE_COLOR = '#f43f5e';

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
    base.setAlphaf(alpha);
    return base;
}

function circle(canvas, x, y, radius, color, alpha = 1) {
    canvas.drawCircle(x, y, Math.max(radius, 0), paint(fill, color, alpha));
}

function radial(x0, y0, r0, x1, y1, r1, from, to) {
    return Skia.Shader.MakeTwoPointConicalGradient(
        { x: x0, y: y0 },
        r0,
        { x: x1, y: y1 },
        r1,
        [Skia.Color(from), Skia.Color(to)],
        null,
        TileMode.Clamp,
    );
}

export function createRenderer() {
    const board = drawBoard();
    const vignette = drawVignette();
    const foodBornAt = new WeakMap();
    const paragraphs = new Map();
    let pending = [];
    let particles = [];
    let popups = [];
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

    /**
     * Text (fruit emoji and "+5" popups) is laid out once per string and reused every frame.
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
            built.layout(CELL * 4);
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
        para.paint(canvas, x - CELL * 2, y - para.getHeight() / 2);
        if (alpha < 1) {
            canvas.restore();
        }
        return true;
    }

    function drawFood(canvas, food, world, now, age) {
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

            canvas.drawOval(
                Skia.XYWHRect(cx - CELL * 0.32 * grow, cy + CELL * 0.42 - CELL * 0.1 * grow, CELL * 0.64 * grow, CELL * 0.2 * grow),
                paint(fill, '#000000', 0.3),
            );
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
        gradient.setShader(radial(cx - size * 0.35, cy - size * 0.35, 0.5, cx, cy, size, FOOD_CORE, color));
        canvas.drawCircle(cx, cy, size, gradient);
    }

    return {
        /**
         * Show an effect once the gliding snake visually reaches the spot where it happened.
         */
        showEvent(event, delayMs) {
            pending.push({ event, runAt: performance.now() + (event.type === 'playerDied' ? 0 : delayMs) });
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
                runEffect(effect.event);
                return false;
            });
            const soonEaten = pending.map((effect) => effect.event.food).filter(Boolean);

            const recorder = Skia.PictureRecorder();
            const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
            canvas.scale(width / WIDTH, height / HEIGHT);
            canvas.drawPicture(board);

            for (const food of [...world.foods, ...soonEaten]) {
                if (!foodBornAt.has(food)) {
                    foodBornAt.set(food, now);
                }
                drawFood(canvas, food, world, now, now - foodBornAt.get(food));
            }

            if (target) {
                drawTarget(canvas, target, now);
            }

            for (const snake of world.snakes) {
                if (snake.body.length) {
                    drawShadow(canvas, snakePoints(snake, progress));
                }
            }
            for (const snake of world.snakes) {
                if (!snake.isPlayer && snake.body.length) {
                    drawSnake(canvas, snake, snakePoints(snake, progress), snake.color, now);
                }
            }
            const player = world.snakes[0];
            drawSnake(canvas, player, snakePoints(player, progress), player.alive ? player.color : DEAD_COLOR, now);

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

            popups = popups.filter((popup) => {
                popup.life -= elapsed * 1.2;
                popup.y -= elapsed * 28;
                if (popup.life <= 0) {
                    return false;
                }
                drawCenteredText(canvas, popup.text, CELL * 0.8, popup.color, popup.x, popup.y, Math.min(1, popup.life * 2));
                return true;
            });

            canvas.drawPicture(vignette);

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

function segmentRadius(i, length) {
    return CELL * 0.44 * (1 - (i / Math.max(length, 6)) * 0.5);
}

function drawShadow(canvas, points) {
    canvas.save();
    canvas.translate(2, 4);
    strokeLine(canvas, points, segmentRadius(points.length / 2, points.length) * 2, '#000000', 0.3);
    canvas.restore();
}

function drawSnake(canvas, snake, points, color, now) {
    if (!points.length) {
        return;
    }

    const dark = mix(color, '#000000', 0.45);
    const light = mix(color, '#ffffff', 0.45);
    const length = points.length;

    // Round-capped segments through the body, thinning and darkening toward the tail.
    for (let i = length - 1; i >= 1; i--) {
        const segment = paint(stroke, mix(color, dark, i / length));
        segment.setStrokeWidth(segmentRadius(i, length) * 2);
        canvas.drawLine(points[i].x, points[i].y, points[i - 1].x, points[i - 1].y, segment);
    }

    for (let i = 2; i < length; i += 2) {
        circle(canvas, points[i].x, points[i].y, segmentRadius(i, length) * 0.38, i % 4 ? light : dark, 0.9);
    }

    canvas.save();
    canvas.translate(-1.2, -1.8);
    strokeLine(canvas, points.slice(0, -1), segmentRadius(length / 2, length) * 0.7, '#ffffff', 0.25);
    canvas.restore();

    drawHead(canvas, snake, points, color, light, now);
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
    const line = paint(stroke, color, alpha);
    line.setStrokeWidth(lineWidth);
    canvas.drawPath(path.build(), line);
}

function drawHead(canvas, snake, points, color, light, now) {
    const head = points[0];
    const radius = CELL * 0.52;
    const angle = (Math.atan2(snake.dir.y, snake.dir.x) * 180) / Math.PI;

    canvas.save();
    canvas.translate(head.x, head.y);
    canvas.rotate(angle, 0, 0);

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
        const tonguePaint = paint(stroke, TONGUE_COLOR);
        tonguePaint.setStrokeWidth(1.6);
        canvas.drawPath(tongue.build(), tonguePaint);
    }

    const headRect = Skia.XYWHRect(radius * 0.1 - radius * 1.08, -radius * 0.92, radius * 2.16, radius * 1.84);
    if (snake.isPlayer && snake.alive) {
        const glow = paint(fill, color, 0.8);
        glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true));
        canvas.drawOval(headRect, glow);
    }
    const headPaint = paint(fill, '#ffffff');
    headPaint.setShader(radial(-radius * 0.2, -radius * 0.35, 1, 0, 0, radius * 1.1, light, color));
    canvas.drawOval(headRect, headPaint);

    for (const side of [-1, 1]) {
        const ex = radius * 0.35;
        const ey = side * radius * 0.45;

        if (!snake.alive) {
            const cross = paint(stroke, '#111827');
            cross.setStrokeWidth(1.8);
            canvas.drawLine(ex - 2.8, ey - 2.8, ex + 2.8, ey + 2.8, cross);
            canvas.drawLine(ex + 2.8, ey - 2.8, ex - 2.8, ey + 2.8, cross);
            continue;
        }

        circle(canvas, ex, ey, radius * 0.36, '#ffffff');
        circle(canvas, ex + radius * 0.1, ey, radius * 0.2, '#0f172a');
        circle(canvas, ex + radius * 0.02, ey - radius * 0.1, radius * 0.08, '#ffffff');
    }

    circle(canvas, radius * 0.1, -radius * 0.78, radius * 0.16, '#fb7185', 0.35);
    circle(canvas, radius * 0.1, radius * 0.78, radius * 0.16, '#fb7185', 0.35);

    canvas.restore();
}

/**
 * A soft pulsing ring where the finger is steering the snake.
 */
function drawTarget(canvas, target, now) {
    const cx = target.x * CELL + CELL / 2;
    const cy = target.y * CELL + CELL / 2;
    const pulse = (now / 900) % 1;

    const ring = paint(stroke, '#ffffff', 0.5);
    ring.setStrokeWidth(1.5);
    canvas.drawCircle(cx, cy, CELL * 0.45, ring);
    ring.setAlphaf(0.45 * (1 - pulse));
    canvas.drawCircle(cx, cy, CELL * (0.45 + pulse * 0.6), ring);
    circle(canvas, cx, cy, 2, '#ffffff', 0.6);
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
 * The grass board is drawn once: a lit center, a soft checker, and scattered grass and flowers.
 */
function drawBoard() {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, WIDTH, HEIGHT));

    const light = paint(fill, '#ffffff');
    light.setShader(radial(WIDTH * 0.5, HEIGHT * 0.4, 0, WIDTH * 0.5, HEIGHT * 0.5, WIDTH * 0.7, '#1f4a2e', '#0d2016'));
    canvas.drawRect(Skia.XYWHRect(0, 0, WIDTH, HEIGHT), light);

    const checker = paint(fill, '#ffffff', 0.028);
    for (let y = 0; y < ROWS; y++) {
        for (let x = y % 2; x < COLS; x += 2) {
            canvas.drawRect(Skia.XYWHRect(x * CELL, y * CELL, CELL, CELL), checker);
        }
    }

    const random = seededRandom(7);
    for (let i = 0; i < 140; i++) {
        const x = random() * WIDTH;
        const y = random() * HEIGHT;
        const grass = paint(stroke, '#86efac', 0.05 + random() * 0.08);
        grass.setStrokeWidth(1);
        for (const lean of [-2, 0, 2]) {
            canvas.drawLine(x, y, x + lean + (random() - 0.5), y - 3 - random() * 3, grass);
        }
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

    return recorder.finishRecordingAsPicture();
}

function drawVignette() {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, WIDTH, HEIGHT));
    const shade = paint(fill, '#ffffff');
    shade.setShader(
        radial(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.45, WIDTH / 2, HEIGHT / 2, WIDTH * 0.72, 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.45)'),
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

function seededRandom(seed) {
    let value = seed;
    return () => {
        value = (value * 16807) % 2147483647;
        return (value - 1) / 2147483646;
    };
}
