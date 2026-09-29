<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreScoreRequest;
use App\Models\Score;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;

class ScoreController extends Controller
{
    /**
     * Show the game with the current leaderboard.
     */
    public function game(): View
    {
        return view('game', [
            'leaderboard' => Score::query()->leaderboard()->get(['player_name', 'points', 'length']),
        ]);
    }

    /**
     * Return the current leaderboard.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'leaderboard' => Score::query()->leaderboard()->get(['player_name', 'points', 'length']),
        ]);
    }

    /**
     * Save a finished game's score and report its rank.
     */
    public function store(StoreScoreRequest $request): JsonResponse
    {
        $score = Score::create($request->validated());

        $rank = Score::query()
            ->where('points', '>', $score->points)
            ->orWhere(fn ($query) => $query->where('points', $score->points)->where('id', '<', $score->id))
            ->count() + 1;

        return response()->json([
            'rank' => $rank,
            'leaderboard' => Score::query()->leaderboard()->get(['player_name', 'points', 'length']),
        ], 201);
    }
}
