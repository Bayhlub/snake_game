<?php

use App\Http\Controllers\ScoreController;
use Illuminate\Support\Facades\Route;

/*
 * Used by the mobile app, which has no browser session or CSRF token.
 */
Route::get('/scores', [ScoreController::class, 'index'])->name('api.scores.index');
Route::post('/scores', [ScoreController::class, 'store'])->middleware('throttle:10,1')->name('api.scores.store');
