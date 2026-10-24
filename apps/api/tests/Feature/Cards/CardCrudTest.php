<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CardCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_an_owned_unpublished_card_with_defaults(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/v1/cards', [
            'slug' => 'alex-smith', 'display_name' => 'Alex Smith',
        ]);

        $response->assertCreated()->assertJsonPath('data.slug', 'alex-smith')
            ->assertJsonPath('data.is_published', false)
            ->assertJsonPath('data.template_key', 'minimal')
            ->assertJsonPath('data.theme_settings', null)
            ->assertJsonMissingPath('data.user_id');
        $this->assertDatabaseHas('cards', [
            'id' => $response->json('data.id'), 'user_id' => $user->id,
            'slug' => 'alex-smith', 'is_published' => false,
        ]);
    }

    public function test_lists_only_owned_cards_with_stable_pagination(): void
    {
        $user = User::factory()->create();
        $this->freezeTime();
        $cards = Card::factory()->count(16)->for($user)->create();
        $other = Card::factory()->published()->create();
        $expected = $cards->sortByDesc('id')->pluck('id')->values();

        $response = $this->actingAs($user)->getJson('/api/v1/cards');

        $response->assertOk()->assertJsonCount(15, 'data')->assertJsonPath('meta.total', 16)
            ->assertJsonPath('meta.per_page', 15)->assertJsonMissing(['id' => $other->id]);
        $this->assertSame($expected->take(15)->all(), array_column($response->json('data'), 'id'));
        $this->getJson('/api/v1/cards?page=2')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $expected->last());
    }

    public function test_owner_can_view_a_draft(): void
    {
        $card = Card::factory()->create();

        $this->actingAs($card->user)->getJson('/api/v1/cards/'.$card->id)
            ->assertOk()->assertJsonPath('data.id', $card->id)
            ->assertJsonPath('data.is_published', false);
    }

    public function test_patch_preserves_omitted_fields_and_clears_nullable_fields(): void
    {
        $card = Card::factory()->create(['company' => 'Acme', 'bio' => 'Old biography']);

        $this->actingAs($card->user)->patchJson('/api/v1/cards/'.$card->id, [
            'slug' => $card->slug, 'display_name' => 'New Name', 'bio' => null,
        ])->assertOk()->assertJsonPath('data.display_name', 'New Name')
            ->assertJsonPath('data.bio', null)->assertJsonPath('data.company', 'Acme');

        $this->assertDatabaseHas('cards', [
            'id' => $card->id, 'display_name' => 'New Name', 'company' => 'Acme',
            'bio' => null, 'slug' => $card->slug,
        ]);
    }

    public function test_deletion_removes_card_and_dependents_but_preserves_other_cards(): void
    {
        $card = Card::factory()->published()->create();
        $other = Card::factory()->for($card->user)->create();
        $link = $card->links()->create(['type' => 'website', 'label' => 'Website', 'url' => 'https://example.com']);
        $asset = $card->assets()->create(['type' => 'avatar', 'storage_key' => 'avatars/test.png', 'mime_type' => 'image/png', 'file_size' => 100]);
        $event = $card->events()->create(['event_type' => 'view']);

        $this->actingAs($card->user)->deleteJson('/api/v1/cards/'.$card->id)->assertNoContent();

        $this->assertModelMissing($card);
        $this->assertModelMissing($link);
        $this->assertModelMissing($asset);
        $this->assertModelMissing($event);
        $this->assertModelExists($other);
        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertNotFound();
    }

    #[DataProvider('privateEndpoints')]
    public function test_private_endpoints_return_401_for_guests(string $method, string $suffix): void
    {
        $card = Card::factory()->create();

        $this->json($method, '/api/v1/cards'.str_replace('{id}', $card->id, $suffix))
            ->assertUnauthorized();

        $this->assertModelExists($card);
        $this->assertDatabaseCount('cards', 1);
    }

    public static function privateEndpoints(): array
    {
        return [
            'index' => ['GET', ''], 'store' => ['POST', ''],
            'show' => ['GET', '/{id}'], 'update' => ['PATCH', '/{id}'],
            'destroy' => ['DELETE', '/{id}'],
        ];
    }

    #[DataProvider('foreignCardActions')]
    public function test_foreign_cards_return_404_even_with_invalid_payloads(string $method, bool $published): void
    {
        $card = Card::factory()->create(['is_published' => $published]);
        $original = $card->refresh()->getAttributes();

        $this->actingAs(User::factory()->create())
            ->json($method, '/api/v1/cards/'.$card->id, ['display_name' => null])
            ->assertNotFound();

        $this->assertSame($original, $card->fresh()->getAttributes());
    }

    public static function foreignCardActions(): array
    {
        return [
            'read draft' => ['GET', false], 'update draft' => ['PATCH', false], 'delete draft' => ['DELETE', false],
            'read published' => ['GET', true], 'update published' => ['PATCH', true], 'delete published' => ['DELETE', true],
        ];
    }

    #[DataProvider('missingCardActions')]
    public function test_missing_or_malformed_card_ids_return_404(string $method, string $id): void
    {
        $this->actingAs(User::factory()->create())->json($method, '/api/v1/cards/'.$id)->assertNotFound();
    }

    public static function missingCardActions(): array
    {
        return [
            'get missing' => ['GET', '00000000-0000-4000-8000-000000000001'],
            'patch missing' => ['PATCH', '00000000-0000-4000-8000-000000000001'],
            'delete missing' => ['DELETE', '00000000-0000-4000-8000-000000000001'],
            'malformed' => ['GET', 'not-a-uuid'],
        ];
    }
}
