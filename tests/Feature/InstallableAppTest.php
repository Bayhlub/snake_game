<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InstallableAppTest extends TestCase
{
    use RefreshDatabase;

    public function test_game_page_links_the_app_manifest_and_icons(): void
    {
        $this->get(route('game'))
            ->assertOk()
            ->assertSee('<link rel="manifest" href="/manifest.json">', false)
            ->assertSee('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">', false);

        $this->assertFileExists(public_path('icons/apple-touch-icon.png'));
    }

    public function test_manifest_is_installable_with_icons_that_exist(): void
    {
        $manifest = json_decode(file_get_contents(public_path('manifest.json')), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame('standalone', $manifest['display']);
        $this->assertSame('/', $manifest['start_url']);

        $sizes = array_column($manifest['icons'], 'sizes');
        $this->assertContains('192x192', $sizes);
        $this->assertContains('512x512', $sizes);
        $this->assertContains('maskable', array_column($manifest['icons'], 'purpose'));

        foreach ($manifest['icons'] as $icon) {
            $this->assertFileExists(public_path($icon['src']));
        }
    }
}
