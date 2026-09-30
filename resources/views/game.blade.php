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
            <header class="mb-5 flex items-center justify-between gap-4">
                <div>
                    <h1 class="flex items-center gap-2 text-4xl font-bold tracking-tight sm:text-5xl">
                        <span class="drop-shadow-[0_4px_12px_rgba(74,222,128,0.45)]">🐍</span>
                        <span class="bg-linear-to-r from-lime-200 via-emerald-300 to-teal-300 bg-clip-text text-transparent">Snake</span>
                    </h1>
                    <p class="mt-1 text-sm text-emerald-200/70">Eat food and fruit, grow long, and don't crash into the other snakes.</p>
                </div>
                <div class="flex shrink-0 flex-wrap justify-end gap-2">
                    <button id="install-button" type="button" hidden class="rounded-full bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300">📲 Install app</button>
                    <button id="sound-toggle" type="button" class="rounded-full bg-white/5 px-4 py-2 text-sm font-medium ring-1 ring-white/10 transition hover:bg-white/10"></button>
                </div>
            </header>

            <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
                <main>
                    <dl class="mb-3 grid grid-cols-4 gap-2 text-center">
                        @foreach ([
                            'score' => ['Score', '⭐', 'text-amber-200'],
                            'length' => ['Length', '📏', 'text-emerald-200'],
                            'best' => ['Best', '🏆', 'text-rose-200'],
                            'bots' => ['Snakes', '🐍', 'text-sky-200'],
                        ] as $stat => [$label, $icon, $color])
                            <div class="rounded-2xl bg-linear-to-b from-white/10 to-white/[0.03] px-2 py-2 ring-1 ring-white/10 backdrop-blur">
                                <dt class="text-[0.7rem] font-medium tracking-wide text-emerald-100/60 uppercase"><span aria-hidden="true">{{ $icon }}</span> {{ $label }}</dt>
                                <dd id="hud-{{ $stat }}" class="{{ $color }} text-xl font-bold tabular-nums sm:text-2xl">0</dd>
                            </div>
                        @endforeach
                    </dl>

                    <div class="rounded-[1.1rem] bg-linear-to-br from-emerald-300/70 via-lime-300/20 to-teal-400/60 p-[3px] shadow-[0_0_70px_-15px_rgba(52,211,153,0.55)]">
                        <div class="relative">
                            <canvas id="game-board" class="block h-auto w-full cursor-crosshair touch-none rounded-2xl" aria-label="Snake game board"></canvas>

                            <p id="event-message" class="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-sm font-semibold whitespace-nowrap opacity-0 transition-opacity duration-300" aria-live="polite"></p>

                            <div id="overlay-start" class="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl bg-black/45 p-6 text-center backdrop-blur-[3px]">
                                <p class="text-4xl sm:text-5xl">🐍🍎</p>
                                <h2 class="text-2xl font-bold sm:text-3xl">Ready?</h2>
                                <button id="start-button" type="button" class="rounded-full bg-emerald-400 px-8 py-3 text-lg font-bold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300">Start game</button>
                                <p class="text-sm text-emerald-100/70 pointer-coarse:hidden">or press <kbd class="kbd">Space</kbd> or an arrow key</p>
                            </div>

                            <div id="overlay-pause" hidden class="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/45 p-6 text-center backdrop-blur-[3px]">
                                <h2 class="text-3xl font-bold">Paused</h2>
                                <button id="resume-button" type="button" class="rounded-full bg-emerald-400 px-8 py-3 text-lg font-bold text-emerald-950 transition hover:bg-emerald-300">Resume</button>
                                <p class="text-sm text-emerald-100/70 pointer-coarse:hidden">or press <kbd class="kbd">Space</kbd></p>
                            </div>

                            <div id="overlay-over" hidden class="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto rounded-2xl bg-black/55 p-4 text-center backdrop-blur-[3px] sm:gap-4 sm:p-6">
                                <h2 class="text-3xl font-bold text-rose-300 sm:text-4xl">Game over</h2>
                                <p id="death-cause" class="text-emerald-100/80"></p>
                                <p class="text-lg">
                                    Score <strong id="final-score" class="text-2xl tabular-nums">0</strong>
                                    <span class="mx-2 text-emerald-100/40">·</span>
                                    Length <strong id="final-length" class="text-2xl tabular-nums">0</strong>
                                </p>
                                <p id="new-best" hidden class="font-semibold text-amber-300">🏆 New best score!</p>

                                <form id="save-form" action="{{ route('scores.store') }}" class="flex w-full max-w-sm flex-col gap-2">
                                    <label for="player-name" class="sr-only">Your name</label>
                                    <div class="flex gap-2">
                                        <input id="player-name" type="text" maxlength="20" autocomplete="nickname" placeholder="Your name" class="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2 text-emerald-50 ring-1 ring-white/20 placeholder:text-emerald-100/40 focus:ring-2 focus:ring-emerald-400 focus:outline-none">
                                        <button id="save-button" type="submit" class="rounded-full bg-amber-300 px-5 py-2 font-bold text-amber-950 transition hover:bg-amber-200 disabled:opacity-50">Save score</button>
                                    </div>
                                    <p id="save-status" class="min-h-5 text-sm text-emerald-100/80" aria-live="polite"></p>
                                </form>

                                <button id="play-again-button" type="button" class="rounded-full bg-emerald-400 px-8 py-3 text-lg font-bold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-300">Play again</button>
                                <p class="text-sm text-emerald-100/70 pointer-coarse:hidden">or press <kbd class="kbd">Space</kbd></p>
                            </div>
                        </div>
                    </div>

                    <div class="mx-auto mt-4 hidden w-48 grid-cols-3 gap-2 pointer-coarse:grid">
                        <button type="button" data-direction="up" class="dpad col-start-2" aria-label="Up">&#x25B2;&#xFE0E;</button>
                        <button type="button" data-direction="left" class="dpad col-start-1" aria-label="Left">&#x25C0;&#xFE0E;</button>
                        <button type="button" data-direction="down" class="dpad" aria-label="Down">&#x25BC;&#xFE0E;</button>
                        <button type="button" data-direction="right" class="dpad" aria-label="Right">&#x25B6;&#xFE0E;</button>
                    </div>

                    <p class="mt-3 text-center text-sm text-emerald-200/60 pointer-coarse:hidden">
                        🖱️ Move your mouse over the board to steer, or use
                        <kbd class="kbd">←</kbd> <kbd class="kbd">↑</kbd> <kbd class="kbd">↓</kbd> <kbd class="kbd">→</kbd> / <kbd class="kbd">WASD</kbd> ·
                        <kbd class="kbd">P</kbd> pause · <kbd class="kbd">M</kbd> sound
                    </p>
                    <p class="mt-3 hidden text-center text-sm text-emerald-200/60 pointer-coarse:block">👆 Touch and drag on the board. The snake follows your finger. Or use the buttons.</p>
                </main>

                <aside class="space-y-4">
                    <section class="rounded-2xl bg-linear-to-b from-white/10 to-white/[0.03] p-4 ring-1 ring-white/10">
                        <h2 class="mb-3 text-lg font-bold">🏆 Top 10</h2>
                        <ol id="leaderboard" class="space-y-1 text-sm"></ol>
                        <p id="leaderboard-empty" class="text-sm text-emerald-200/60">No scores yet. Be the first!</p>
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
                        <h2 class="mb-3 text-lg font-bold">How to play</h2>
                        <ul class="space-y-2 text-emerald-100/80">
                            <li><span class="mr-1 inline-block size-2.5 rounded-full bg-yellow-300"></span> Food: <strong>+1</strong></li>
                            <li>🍒 <strong>+3</strong> · 🍎 🍇 <strong>+5</strong> · 🍉 <strong>+10</strong><br><span class="text-emerald-200/60">Fruit disappears after a few seconds.</span></li>
                            <li>💥 Hit a wall or another snake: game over.</li>
                            <li>🌀 Crossing your own body is safe.</li>
                            <li>🐍 If another snake runs into you, it crashes and turns into food.</li>
                        </ul>
                    </section>
                </aside>
            </div>
        </div>
    </body>
</html>
