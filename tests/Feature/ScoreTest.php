<?php

namespace Tests\Feature;

use App\Models\Score;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ScoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_game_page_includes_the_leaderboard(): void
    {
        Score::factory()->create(['player_name' => 'Noy', 'points' => 42]);

        $this->get(route('game'))
            ->assertOk()
            ->assertSee('game-board')
            ->assertSee('"player_name":"Noy"', false);
    }

    public function test_score_is_saved_and_its_rank_returned(): void
    {
        Score::factory()->create(['points' => 50]);
        Score::factory()->create(['points' => 10]);

        $this->postJson(route('scores.store'), [
            'player_name' => '  Bai  ',
            'points' => 30,
            'length' => 18,
        ])
            ->assertCreated()
            ->assertJsonPath('rank', 2)
            ->assertJsonPath('leaderboard.1.player_name', 'Bai');

        $this->assertDatabaseHas('scores', ['player_name' => 'Bai', 'points' => 30, 'length' => 18]);
    }

    public function test_tied_score_ranks_below_the_earlier_one(): void
    {
        Score::factory()->create(['points' => 30]);

        $this->postJson(route('scores.store'), ['player_name' => 'Late', 'points' => 30, 'length' => 10])
            ->assertJsonPath('rank', 2);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('invalidScores')]
    public function test_invalid_scores_are_rejected(array $overrides, string $field): void
    {
        $this->postJson(route('scores.store'), [...['player_name' => 'Bai', 'points' => 10, 'length' => 8], ...$overrides])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertDatabaseCount('scores', 0);
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidScores(): array
    {
        return [
            'blank name' => [['player_name' => '   '], 'player_name'],
            'name too long' => [['player_name' => str_repeat('a', 21)], 'player_name'],
            'negative points' => [['points' => -1], 'points'],
            'impossible points' => [['points' => 100001], 'points'],
            'zero length' => [['length' => 0], 'length'],
        ];
    }

    public function test_leaderboard_lists_the_top_ten_best_first(): void
    {
        Score::factory()->count(12)->sequence(fn ($sequence) => ['points' => $sequence->index * 5])->create();

        $response = $this->getJson(route('scores.index'))->assertOk();

        $this->assertSame(
            [55, 50, 45, 40, 35, 30, 25, 20, 15, 10],
            array_column($response->json('leaderboard'), 'points'),
        );
    }

    public function test_saving_scores_is_rate_limited(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson(route('scores.store'), ['player_name' => 'Bai', 'points' => $i, 'length' => 5])->assertCreated();
        }

        $this->postJson(route('scores.store'), ['player_name' => 'Bai', 'points' => 99, 'length' => 5])
            ->assertTooManyRequests();
    }

    public function test_mobile_app_can_save_a_score_and_read_the_leaderboard_through_the_api(): void
    {
        Score::factory()->create(['player_name' => 'Noy', 'points' => 50]);

        $this->postJson(route('api.scores.store'), ['player_name' => 'Phone', 'points' => 20, 'length' => 9])
            ->assertCreated()
            ->assertJsonPath('rank', 2);

        $this->getJson(route('api.scores.index'))
            ->assertOk()
            ->assertJsonPath('leaderboard.0.player_name', 'Noy')
            ->assertJsonPath('leaderboard.1.player_name', 'Phone');
    }

    public function test_api_routes_skip_the_browser_session_and_csrf_check(): void
    {
        $middleware = app('router')->getRoutes()->getByName('api.scores.store')->gatherMiddleware();

        $this->assertContains('api', $middleware);
        $this->assertNotContains('web', $middleware);
        $this->assertContains('throttle:10,1', $middleware);
    }
}
