<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        <title>{{ config('app.name') }}</title>

        <link rel="manifest" href="/manifest.json">
        <meta name="theme-color" content="#07100c">
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
        <meta name="mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-title" content="Snake">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

        @fonts
        @vite(['resources/css/app.css', 'resources/js/app.js'])
    </head>
    <body class="min-h-screen bg-board-night font-sans text-emerald-50 antialiased">
        <div id="snake-game" class="mx-auto max-w-6xl px-4 py-6 lg:py-10">
            <header class="mb-5 flex items-start justify-between gap-4 sm:items-center">
                <div>
                    <h1 class="flex items-center gap-2 text-4xl font-bold tracking-tight sm:text-5xl">
                        <span class="drop-shadow-[0_4px_12px_rgba(74,222,128,0.45)]">🐍</span>
                        <span data-i18n="title" class="bg-linear-to-r from-lime-200 via-emerald-300 to-teal-300 bg-clip-text leading-normal text-transparent">Snake</span>
                    </h1>
                    <p data-i18n="tagline" class="mt-1 text-sm text-emerald-200/70">Eat food and fruit, grow long, and don't crash into the other snakes.</p>
                </div>
                <div class="flex shrink-0 flex-wrap justify-end gap-2">
                    <div id="language-switch" role="group" aria-label="Language" data-i18n-aria-label="language" class="flex rounded-full bg-white/5 p-1 ring-1 ring-white/10">
                        <button type="button" data-language="en" lang="en" aria-pressed="true" class="lang-option">EN</button>
                        <button type="button" data-language="lo" lang="lo" aria-pressed="false" class="lang-option">ລາວ</button>
                    </div>
                    <button id="leave-online" type="button" hidden data-i18n="leave" class="rounded-full bg-rose-400/15 px-4 py-2 text-sm font-bold text-rose-200 ring-1 ring-rose-300/30 transition hover:bg-rose-400/25">Leave</button>
                    <button id="install-button" type="button" hidden data-i18n="installApp" class="rounded-full bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300">📲 Install app</button>
                    <button id="sound-toggle" type="button" class="rounded-full bg-white/5 px-4 py-2 text-sm font-medium ring-1 ring-white/10 transition hover:bg-white/10"></button>
                </div>
            </header>

            <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <main>
                    <dl class="mb-3 grid grid-cols-4 gap-2 text-center">
                        @foreach ([
                            'score' => ['score', 'Score', '⭐', 'text-amber-200'],
                            'length' => ['length', 'Length', '📏', 'text-emerald-200'],
                            'best' => ['best', 'Best', '🏆', 'text-rose-200'],
                            'bots' => ['snakes', 'Snakes', '🐍', 'text-sky-200'],
                        ] as $stat => [$key, $label, $icon, $color])
                            <div class="rounded-2xl bg-linear-to-b from-white/10 to-white/[0.03] px-2 py-2 ring-1 ring-white/10 backdrop-blur">
                                <dt class="text-[0.7rem] font-medium tracking-wide text-emerald-100/60 uppercase"><span aria-hidden="true">{{ $icon }}</span> <span data-i18n="{{ $key }}">{{ $label }}</span></dt>
                                <dd id="hud-{{ $stat }}" class="{{ $color }} text-xl font-bold tabular-nums sm:text-2xl">0</dd>
                            </div>
                        @endforeach
                    </dl>

                    <div class="rounded-[1.1rem] bg-linear-to-br from-emerald-300/70 via-lime-300/20 to-teal-400/60 p-[3px] shadow-[0_0_70px_-15px_rgba(52,211,153,0.55)]">
                        <div class="relative">
                            <canvas id="game-board" class="block h-auto w-full cursor-crosshair touch-none rounded-2xl" aria-label="Snake game board. Touch and drag to steer." data-i18n-aria-label="boardLabel"></canvas>

                            <p id="event-message" class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-sm font-semibold whitespace-nowrap opacity-0 transition-opacity duration-300" aria-live="polite"></p>

                            <div id="zoom-controls" hidden class="absolute top-2 right-2 flex flex-col gap-1.5 sm:top-3 sm:right-3">
                                <button id="zoom-in" type="button" aria-label="Zoom in" data-i18n-aria-label="zoomIn" class="grid size-7 place-items-center rounded-full bg-black/55 text-lg leading-none sm:size-9 sm:text-xl font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-black/75">+</button>
                                <button id="zoom-out" type="button" aria-label="Zoom out" data-i18n-aria-label="zoomOut" class="grid size-7 place-items-center rounded-full bg-black/55 text-lg leading-none sm:size-9 sm:text-xl font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-black/75">&minus;</button>
                            </div>

                            <div id="power-ups" class="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5 sm:bottom-3 sm:left-3" aria-live="polite"></div>
                            <template id="power-up-chip">
                                <div class="flex items-center gap-1.5 rounded-full bg-black/55 py-0.5 pr-2.5 pl-1.5 text-xs font-semibold ring-1 ring-white/15 backdrop-blur-sm sm:text-sm">
                                    <span data-emoji aria-hidden="true"></span>
                                    <span data-label></span>
                                    <span class="h-1.5 w-8 overflow-hidden rounded-full bg-white/15 sm:w-10"><span data-bar class="block h-full rounded-full transition-[width] duration-200 ease-linear"></span></span>
                                </div>
                            </template>

                            <div id="overlay-start" class="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl bg-black/45 p-6 text-center backdrop-blur-[3px]">
                                <p class="hidden text-4xl sm:block sm:text-5xl">🪱🍬</p>
                                <h2 data-i18n="ready" class="text-2xl font-bold sm:text-3xl">Ready?</h2>
                                <div class="flex w-full flex-col items-center gap-2">
                                    <p data-i18n="pickWorm" class="text-sm font-semibold text-emerald-100/80">Pick your worm</p>
                                    <div id="skin-picker" class="grid w-full max-w-[25rem] grid-cols-5 gap-1.5"></div>
                                    <template id="skin-option">
                                        <button type="button" class="min-w-0 rounded-xl bg-white/5 p-1 ring-1 ring-white/15 transition hover:bg-white/15 aria-pressed:bg-white/20 aria-pressed:ring-2 aria-pressed:ring-emerald-300"><canvas class="block aspect-[3/1] h-auto w-full"></canvas></button>
                                    </template>
                                </div>
                                <button id="start-button" type="button" data-i18n="startGame" class="rounded-full bg-emerald-400 px-8 py-3 text-lg font-bold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300">Start game</button>
                                <button id="online-button" type="button" data-i18n="playOnline" class="rounded-full bg-white/10 px-6 py-2 font-bold ring-1 ring-white/20 transition hover:bg-white/20">🌐 Play online</button>
                                <p class="text-sm text-emerald-100/70 pointer-coarse:hidden"><span data-i18n="orPress">or press</span> <kbd class="kbd">Space</kbd> <span data-i18n="orArrowKey">or an arrow key</span></p>
                            </div>

                            <div id="overlay-join" hidden class="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl bg-black/60 p-6 text-center backdrop-blur-[3px]">
                                <h2 data-i18n="joinTitle" class="text-2xl font-bold sm:text-3xl">Play online</h2>
                                <p data-i18n="joinHint" class="max-w-sm text-sm text-emerald-100/75">Everyone who joins plays on one board, with the computer snakes.</p>
                                <form id="join-form" class="flex w-full max-w-sm flex-col gap-2">
                                    <label for="join-name" data-i18n="yourName" class="sr-only">Your name</label>
                                    <div class="flex gap-2">
                                        <input id="join-name" type="text" maxlength="20" autocomplete="nickname" placeholder="Your name" data-i18n-placeholder="yourName" class="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-emerald-50 ring-1 ring-white/20 placeholder:text-emerald-100/40 focus:ring-2 focus:ring-emerald-400 focus:outline-none">
                                        <button id="join-button" type="submit" data-i18n="join" class="rounded-full bg-emerald-400 px-5 py-2 font-bold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50">Join</button>
                                    </div>
                                    <p id="join-status" class="min-h-5 text-sm text-emerald-100/80" aria-live="polite"></p>
                                </form>
                                <button id="join-back" type="button" data-i18n="back" class="text-sm font-semibold text-emerald-100/70 underline-offset-4 hover:underline">Back</button>
                            </div>

                            <div id="overlay-pause" hidden class="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/45 p-6 text-center backdrop-blur-[3px]">
                                <h2 data-i18n="paused" class="text-3xl font-bold">Paused</h2>
                                <button id="resume-button" type="button" data-i18n="resume" class="rounded-full bg-emerald-400 px-8 py-3 text-lg font-bold text-emerald-950 transition hover:bg-emerald-300">Resume</button>
                                <p class="text-sm text-emerald-100/70 pointer-coarse:hidden"><span data-i18n="orPress">or press</span> <kbd class="kbd">Space</kbd></p>
                            </div>

                            <div id="overlay-over" hidden class="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl bg-black/55 p-4 text-center backdrop-blur-[3px] sm:gap-4 sm:p-6">
                                <h2 data-i18n="gameOver" class="text-3xl font-bold text-rose-300 sm:text-4xl">Game over</h2>
                                <p id="death-cause" class="text-emerald-100/80"></p>
                                <p class="text-lg">
                                    <span data-i18n="score">Score</span> <strong id="final-score" class="text-2xl tabular-nums">0</strong>
                                    <span class="mx-2 text-emerald-100/40">·</span>
                                    <span data-i18n="length">Length</span> <strong id="final-length" class="text-2xl tabular-nums">0</strong>
                                </p>
                                <p id="new-best" hidden data-i18n="newBest" class="font-semibold text-amber-300">🏆 New best score!</p>

                                <form id="save-form" action="{{ route('scores.store') }}" class="flex w-full max-w-sm flex-col gap-2">
                                    <label for="player-name" data-i18n="yourName" class="sr-only">Your name</label>
                                    <div class="flex gap-2">
                                        <input id="player-name" type="text" maxlength="20" autocomplete="nickname" placeholder="Your name" data-i18n-placeholder="yourName" class="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-emerald-50 ring-1 ring-white/20 placeholder:text-emerald-100/40 focus:ring-2 focus:ring-emerald-400 focus:outline-none">
                                        <button id="save-button" type="submit" data-i18n="saveScore" class="rounded-full bg-amber-300 px-5 py-2 font-bold text-amber-950 transition hover:bg-amber-200 disabled:opacity-50">Save score</button>
                                    </div>
                                    <p id="save-status" class="min-h-5 text-sm text-emerald-100/80" aria-live="polite"></p>
                                </form>

                                <button id="play-again-button" type="button" data-i18n="playAgain" class="rounded-full bg-emerald-400 px-8 py-3 text-lg font-bold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300">Play again</button>
                                <p class="text-sm text-emerald-100/70 pointer-coarse:hidden"><span data-i18n="orPress">or press</span> <kbd class="kbd">Space</kbd></p>
                            </div>
                        </div>
                    </div>

                    <div class="mx-auto mt-4 hidden w-48 grid-cols-3 gap-2 pointer-coarse:grid">
                        <button type="button" data-direction="up" class="dpad col-start-2" aria-label="Up" data-i18n-aria-label="up">&#x25B2;&#xFE0E;</button>
                        <button type="button" data-direction="left" class="dpad col-start-1" aria-label="Left" data-i18n-aria-label="left">&#x25C0;&#xFE0E;</button>
                        <button type="button" data-direction="down" class="dpad" aria-label="Down" data-i18n-aria-label="down">&#x25BC;&#xFE0E;</button>
                        <button type="button" data-direction="right" class="dpad" aria-label="Right" data-i18n-aria-label="right">&#x25B6;&#xFE0E;</button>
                    </div>

                    <p class="mt-3 text-center text-sm text-emerald-200/60 pointer-coarse:hidden">
                        <span data-i18n="steerMouse">🖱️ Move your mouse over the board to steer, or use</span>
                        <kbd class="kbd">←</kbd> <kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> <kbd class="kbd">→</kbd> / <kbd class="kbd">WASD</kbd> ·
                        <kbd class="kbd">P</kbd> <span data-i18n="pauseKey">pause</span> · <kbd class="kbd">M</kbd> <span data-i18n="soundKey">sound</span>
                    </p>
                    <p data-i18n="zoomHint" class="mt-1 text-center text-sm text-emerald-200/60">Scroll, pinch or use + and − to zoom.</p>
                    <p data-i18n="steerTouch" class="mt-3 hidden text-center text-sm text-emerald-200/60 pointer-coarse:block">👆 Put a finger anywhere on the board and drag the way you want to go, like a joystick. Or use the buttons.</p>
                </main>

                <aside class="space-y-4">
                    <section id="online-panel" hidden class="rounded-2xl bg-linear-to-b from-sky-300/10 to-white/[0.03] p-4 ring-1 ring-sky-200/20">
                        <h2 data-i18n="onlineNow" class="mb-3 text-lg font-bold">🌐 Playing now</h2>
                        <ol id="online-players" class="space-y-1 text-sm"></ol>
                        <template id="online-player-row">
                            <li class="flex items-center gap-3 rounded-lg px-2 py-1 odd:bg-white/5">
                                <span data-dot class="size-3 shrink-0 rounded-full"></span>
                                <span data-name class="flex-1 truncate"></span>
                                <span data-points class="font-bold tabular-nums"></span>
                            </li>
                        </template>
                    </section>

                    <section class="rounded-2xl bg-linear-to-b from-white/10 to-white/[0.03] p-4 ring-1 ring-white/10">
                        <h2 data-i18n="topTen" class="mb-3 text-lg font-bold">🏆 Top 10</h2>
                        <ol id="leaderboard" class="space-y-1 text-sm"></ol>
                        <p id="leaderboard-empty" data-i18n="noScores" class="text-sm text-emerald-200/60">No scores yet. Be the first!</p>
                        <template id="leaderboard-row">
                            <li class="flex items-center gap-3 rounded-lg px-2 py-1 odd:bg-white/5">
                                <span data-rank class="w-5 text-right font-bold text-emerald-300/80 tabular-nums"></span>
                                <span data-name class="flex-1 truncate"></span>
                                <span data-points class="font-bold tabular-nums"></span>
                            </li>
                        </template>
                        <script id="leaderboard-data" type="application/json">@json($leaderboard)</script>
                    </section>

                    <section class="rounded-2xl bg-linear-to-b from-white/10 to-white/[0.03] p-4 text-sm ring-1 ring-white/10">
                        <h2 data-i18n="howToPlay" class="mb-3 text-lg font-bold">How to play</h2>
                        <ul class="space-y-2 text-emerald-100/80">
                            <li><span class="mr-1 inline-block size-2.5 rounded-full bg-yellow-300"></span> <span data-i18n="food">Food</span>: <strong>+1</strong></li>
                            <li>🍒 🍓 🫐 <strong>+3</strong> · 🍎 🍇 🍊 🍌 🍑 <strong>+5</strong> · 🥭 🍍 🥥 <strong>+7</strong> · 🍉 <strong>+10</strong><br><span data-i18n="fruitFades" class="text-emerald-200/60">Fruit disappears after a few seconds.</span></li>
                            <li>💥 <span data-i18n="crashRule">Hit a wall or another snake: game over.</span></li>
                            <li>🌀 <span data-i18n="crossRule">Crossing your own body is safe.</span></li>
                            <li>🐍 <span data-i18n="botRule">If another snake runs into you, it crashes and turns into food.</span></li>
                        </ul>

                        <h3 data-i18n="powerUps" class="mt-4 mb-2 font-bold">Power-ups</h3>
                        <ul class="space-y-2 text-emerald-100/80">
                            @foreach ([
                                ['🛡️', 'shield', 'Shield', 'survive one crash.'],
                                ['🧲', 'magnet', 'Magnet', 'pulls nearby food to you.'],
                                ['⏳', 'slow', 'Slow-mo', 'slows the whole game down.'],
                                ['👻', 'ghost', 'Ghost', 'pass through other snakes.'],
                            ] as [$icon, $type, $name, $effect])
                                <li><span aria-hidden="true">{{ $icon }}</span> <strong data-i18n="powerUp.{{ $type }}">{{ $name }}</strong>: <span data-i18n="powerUpHelp.{{ $type }}">{{ $effect }}</span></li>
                            @endforeach
                            <li data-i18n="powerUpsFade" class="text-emerald-200/60">They glow, spin and vanish if you wait too long.</li>
                        </ul>
                    </section>
                </aside>
            </div>
        </div>
    </body>
</html>
