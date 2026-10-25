<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicCardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_can_read_only_the_published_profile_fields(): void
    {
        $card = Card::factory()->published()->create([
            'slug' => 'alex-smith', 'display_name' => 'Alex Smith',
            'job_title' => 'Designer', 'company' => 'Acme', 'bio' => 'Hello',
            'phone' => '+44 1234 567890', 'email' => 'alex@example.com',
            'website' => 'https://example.com', 'location' => 'London',
            'theme_settings' => ['private_future_setting' => 'hidden'],
        ]);
        $card->links()->create(['type' => 'website', 'label' => 'Private link', 'url' => 'https://private.example.com', 'is_visible' => false]);

        $this->getJson('/api/v1/public/cards/alex-smith')->assertOk()->assertExactJson([
            'data' => [
                'slug' => 'alex-smith', 'display_name' => 'Alex Smith',
                'job_title' => 'Designer', 'company' => 'Acme', 'bio' => 'Hello',
                'phone' => '+44 1234 567890', 'email' => 'alex@example.com',
                'website' => 'https://example.com', 'location' => 'London',
                'template_key' => 'minimal',
                'links' => [],
                'assets' => [],
            ],
        ]);
    }

    public function test_drafts_and_missing_slugs_return_404(): void
    {
        $card = Card::factory()->create();

        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertNotFound();
        $this->getJson('/api/v1/public/cards/does-not-exist')->assertNotFound();
        $this->actingAs($card->user)->getJson('/api/v1/public/cards/'.$card->slug)->assertNotFound();
    }

    public function test_publishing_renaming_and_unpublishing_change_public_access(): void
    {
        $card = Card::factory()->create(['slug' => 'original-slug']);
        $this->actingAs($card->user);

        $this->patchJson('/api/v1/cards/'.$card->id, ['is_published' => true])
            ->assertOk()->assertJsonPath('data.is_published', true);
        $this->assertDatabaseHas('cards', ['id' => $card->id, 'is_published' => true]);
        $this->getJson('/api/v1/public/cards/original-slug')->assertOk();

        $this->patchJson('/api/v1/cards/'.$card->id, ['slug' => 'new-slug'])->assertOk();
        $this->assertDatabaseHas('cards', ['id' => $card->id, 'slug' => 'new-slug']);
        $this->getJson('/api/v1/public/cards/original-slug')->assertNotFound();
        $this->getJson('/api/v1/public/cards/new-slug')->assertOk();

        $this->patchJson('/api/v1/cards/'.$card->id, ['is_published' => false])
            ->assertOk()->assertJsonPath('data.is_published', false);
        $this->assertDatabaseHas('cards', ['id' => $card->id, 'is_published' => false]);
        $this->getJson('/api/v1/public/cards/new-slug')->assertNotFound();
    }
}
