<?php

namespace App\Models;

use Database\Factories\ScoreFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['player_name', 'points', 'length'])]
class Score extends Model
{
    /** @use HasFactory<ScoreFactory> */
    use HasFactory;

    /**
     * Number of scores shown on the leaderboard.
     */
    public const LEADERBOARD_SIZE = 10;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'points' => 'integer',
            'length' => 'integer',
        ];
    }

    /**
     * Order scores best first, with earlier scores winning ties.
     *
     * @param  Builder<Score>  $query
     */
    #[Scope]
    protected function leaderboard(Builder $query): void
    {
        $query->orderByDesc('points')->orderBy('id')->limit(self::LEADERBOARD_SIZE);
    }
}
