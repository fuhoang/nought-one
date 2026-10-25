<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use App\Models\CardLink;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CardLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_links_append_with_visible_defaults_and_owner_can_list_them(): void
    {
        $card = Card::factory()->create();
        $this->actingAs($card->user);
        $url = '/api/v1/cards/'.$card->id.'/links';

        $first = $this->postJson($url, ['type' => 'website', 'label' => 'Portfolio', 'url' => 'https://example.com']);
        $first->assertCreated()->assertJsonPath('data.position', 0)->assertJsonPath('data.is_visible', true);
        $second = $this->postJson($url, ['type' => 'linkedin', 'label' => 'LinkedIn', 'url' => 'https://linkedin.com/in/example', 'is_visible' => false]);
        $second->assertCreated()->assertJsonPath('data.position', 1)->assertJsonPath('data.is_visible', false);

        $this->assertDatabaseHas('card_links', ['id' => $first->json('data.id'), 'card_id' => $card->id, 'position' => 0]);
        $this->assertDatabaseHas('card_links', ['id' => $second->json('data.id'), 'card_id' => $card->id, 'position' => 1, 'is_visible' => false]);
        $this->getJson($url)->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('data.0.id', $first->json('data.id'));
        $this->getJson('/api/v1/cards/'.$card->id)->assertOk()->assertJsonCount(2, 'data.links')
            ->assertJsonPath('data.links.1.is_visible', false);
    }

    public function test_partial_updates_preserve_order_and_omitted_fields(): void
    {
        $link = CardLink::factory()->create(['label' => 'Original', 'position' => 4]);

        $this->actingAs($link->card->user)->patchJson($this->linkUrl($link), ['label' => 'Updated', 'is_visible' => false])
            ->assertOk()->assertJsonPath('data.label', 'Updated')->assertJsonPath('data.position', 4)
            ->assertJsonPath('data.url', 'https://example.com')->assertJsonPath('data.is_visible', false);

        $this->assertDatabaseHas('card_links', ['id' => $link->id, 'label' => 'Updated', 'position' => 4, 'is_visible' => false]);
    }

    public function test_deleting_link_compacts_positions_and_preserves_other_cards(): void
    {
        $card = Card::factory()->create();
        $links = CardLink::factory()->count(3)->for($card)->sequence(['position' => 0], ['position' => 1], ['position' => 2])->create();
        $other = CardLink::factory()->create();

        $this->actingAs($card->user)->deleteJson($this->linkUrl($links[1]))->assertNoContent();

        $this->assertModelMissing($links[1]);
        $this->assertModelExists($other);
        $this->assertDatabaseHas('card_links', ['id' => $links[0]->id, 'position' => 0]);
        $this->assertDatabaseHas('card_links', ['id' => $links[2]->id, 'position' => 1]);
    }

    public function test_reordering_includes_hidden_links_and_returns_saved_order(): void
    {
        $card = Card::factory()->create();
        $first = CardLink::factory()->for($card)->create(['position' => 0]);
        $hidden = CardLink::factory()->for($card)->hidden()->create(['position' => 1]);
        $last = CardLink::factory()->for($card)->create(['position' => 2]);

        $response = $this->actingAs($card->user)->putJson('/api/v1/cards/'.$card->id.'/links/order', [
            'link_ids' => [$last->id, $first->id, $hidden->id],
        ]);

        $response->assertOk()->assertJsonPath('data.0.id', $last->id)->assertJsonPath('data.1.id', $first->id)
            ->assertJsonPath('data.2.id', $hidden->id)->assertJsonPath('data.2.position', 2);
        $this->assertDatabaseHas('card_links', ['id' => $last->id, 'position' => 0]);
        $this->assertDatabaseHas('card_links', ['id' => $first->id, 'position' => 1]);
        $this->assertDatabaseHas('card_links', ['id' => $hidden->id, 'position' => 2]);
    }

    public function test_empty_card_accepts_empty_order_and_returns_empty_links(): void
    {
        $card = Card::factory()->create();

        $this->actingAs($card->user)->putJson('/api/v1/cards/'.$card->id.'/links/order', ['link_ids' => []])
            ->assertOk()->assertExactJson(['data' => []]);
    }

    #[DataProvider('invalidOrders')]
    public function test_invalid_order_returns_422_and_preserves_all_positions(string $kind): void
    {
        $card = Card::factory()->create();
        $first = CardLink::factory()->for($card)->create(['position' => 0]);
        $second = CardLink::factory()->for($card)->hidden()->create(['position' => 1]);
        $foreign = CardLink::factory()->create();
        $payload = match ($kind) {
            'missing field' => [],
            'empty' => ['link_ids' => []],
            'omitted' => ['link_ids' => [$first->id]],
            'duplicate' => ['link_ids' => [$first->id, $first->id]],
            'foreign' => ['link_ids' => [$first->id, $foreign->id]],
            'unknown' => ['link_ids' => [$first->id, '00000000-0000-4000-8000-000000000001']],
            'invalid uuid' => ['link_ids' => ['bad-id', $second->id]],
            'not list' => ['link_ids' => ['first' => $first->id, 'second' => $second->id]],
            'null' => ['link_ids' => null],
        };

        $this->actingAs($card->user)->putJson('/api/v1/cards/'.$card->id.'/links/order', $payload)->assertUnprocessable();

        $this->assertDatabaseHas('card_links', ['id' => $first->id, 'position' => 0]);
        $this->assertDatabaseHas('card_links', ['id' => $second->id, 'position' => 1]);
        $this->assertDatabaseHas('card_links', ['id' => $foreign->id, 'position' => 0]);
    }

    public static function invalidOrders(): array
    {
        return array_combine($cases = ['missing field', 'empty', 'omitted', 'duplicate', 'foreign', 'unknown', 'invalid uuid', 'not list', 'null'], array_map(fn ($case) => [$case], $cases));
    }

    public function test_public_profile_returns_only_visible_links_in_order_and_hiding_takes_effect(): void
    {
        $card = Card::factory()->published()->create();
        $later = CardLink::factory()->for($card)->create(['label' => 'Later', 'position' => 2]);
        CardLink::factory()->for($card)->hidden()->create(['label' => 'Secret', 'position' => 1]);
        CardLink::factory()->for($card)->create(['label' => 'First', 'position' => 0]);

        $response = $this->getJson('/api/v1/public/cards/'.$card->slug)->assertOk();
        $this->assertSame([
            ['type' => 'website', 'label' => 'First', 'url' => 'https://example.com'],
            ['type' => 'website', 'label' => 'Later', 'url' => 'https://example.com'],
        ], $response->json('data.links'));

        $this->actingAs($card->user)->patchJson($this->linkUrl($later), ['is_visible' => false])->assertOk();
        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertOk()->assertJsonCount(1, 'data.links')
            ->assertJsonPath('data.links.0.label', 'First');
    }

    #[DataProvider('endpoints')]
    public function test_guests_receive_401(string $method, string $suffix): void
    {
        $link = CardLink::factory()->create();

        $this->json($method, '/api/v1/cards/'.$link->card_id.'/links'.str_replace('{link}', $link->id, $suffix))
            ->assertUnauthorized();

        $this->assertModelExists($link);
        $this->assertDatabaseCount('card_links', 1);
    }

    #[DataProvider('endpoints')]
    public function test_another_users_card_returns_404_before_validation(string $method, string $suffix): void
    {
        $link = CardLink::factory()->create();
        $original = $link->refresh()->getAttributes();

        $this->actingAs(User::factory()->create())->json($method, '/api/v1/cards/'.$link->card_id.'/links'.str_replace('{link}', $link->id, $suffix))
            ->assertNotFound();

        $this->assertSame($original, $link->fresh()->getAttributes());
        $this->assertDatabaseCount('card_links', 1);
    }

    public static function endpoints(): array
    {
        return ['list' => ['GET', ''], 'create' => ['POST', ''], 'update' => ['PATCH', '/{link}'], 'delete' => ['DELETE', '/{link}'], 'order' => ['PUT', '/order']];
    }

    #[DataProvider('mutationMethods')]
    public function test_link_from_another_owned_card_returns_404(string $method): void
    {
        $link = CardLink::factory()->create();
        $otherCard = Card::factory()->for($link->card->user)->create();

        $this->actingAs($otherCard->user)->json($method, '/api/v1/cards/'.$otherCard->id.'/links/'.$link->id, ['label' => 'Changed'])
            ->assertNotFound();

        $this->assertDatabaseHas('card_links', ['id' => $link->id, 'label' => 'Website', 'card_id' => $link->card_id]);
    }

    public static function mutationMethods(): array
    {
        return ['update' => ['PATCH'], 'delete' => ['DELETE']];
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_fields_return_422_on_creation_and_update(string $field, mixed $value): void
    {
        $link = CardLink::factory()->create();
        $original = $link->refresh()->getAttributes();
        $this->actingAs($link->card->user);

        $this->postJson('/api/v1/cards/'.$link->card_id.'/links', [
            'type' => 'website', 'label' => 'Website', 'url' => 'https://example.com', $field => $value,
        ])->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->patchJson($this->linkUrl($link), [$field => $value])->assertUnprocessable()->assertJsonValidationErrors($field);

        $this->assertSame($original, $link->fresh()->getAttributes());
        $this->assertDatabaseCount('card_links', 1);
    }

    public static function invalidFields(): array
    {
        return [
            'type' => ['type', 'unsupported'], 'empty type' => ['type', null],
            'empty label' => ['label', ''], 'long label' => ['label', str_repeat('a', 101)],
            'empty url' => ['url', null], 'javascript' => ['url', 'javascript:alert(1)'],
            'ftp' => ['url', 'ftp://example.com'], 'long url' => ['url', 'https://example.com/'.str_repeat('a', 2048)],
            'visibility' => ['is_visible', 'yes'], 'null visibility' => ['is_visible', null],
            'position' => ['position', 12], 'ownership' => ['card_id', '00000000-0000-4000-8000-000000000001'],
            'identity' => ['id', '00000000-0000-4000-8000-000000000001'],
        ];
    }

    public function test_required_fields_return_422(): void
    {
        $card = Card::factory()->create();

        $this->actingAs($card->user)->postJson('/api/v1/cards/'.$card->id.'/links', [])
            ->assertUnprocessable()->assertJsonValidationErrors(['type', 'label', 'url']);

        $this->assertDatabaseCount('card_links', 0);
    }

    public function test_failed_reorder_rolls_back_positions_already_written(): void
    {
        $card = Card::factory()->create();
        $first = CardLink::factory()->for($card)->create(['position' => 0]);
        $second = CardLink::factory()->for($card)->create(['position' => 1]);
        $updates = 0;
        CardLink::updating(function (CardLink $link) use (&$updates): void {
            if (++$updates === 2) {
                throw new RuntimeException('Simulated persistence failure.');
            }
        });

        $this->actingAs($card->user)->putJson('/api/v1/cards/'.$card->id.'/links/order', [
            'link_ids' => [$second->id, $first->id],
        ])->assertInternalServerError();

        $this->assertSame(2, $updates);
        $this->assertDatabaseHas('card_links', ['id' => $first->id, 'position' => 0]);
        $this->assertDatabaseHas('card_links', ['id' => $second->id, 'position' => 1]);
    }

    #[DataProvider('supportedTypes')]
    public function test_supported_types_can_be_created(string $type): void
    {
        $card = Card::factory()->create();

        $response = $this->actingAs($card->user)->postJson('/api/v1/cards/'.$card->id.'/links', [
            'type' => $type, 'label' => 'My profile', 'url' => 'https://example.com/profile',
        ]);

        $response->assertCreated()->assertJsonPath('data.type', $type);
        $this->assertDatabaseHas('card_links', ['id' => $response->json('data.id'), 'card_id' => $card->id, 'type' => $type]);
    }

    public static function supportedTypes(): array
    {
        return [
            'website' => ['website'], 'linkedin' => ['linkedin'], 'instagram' => ['instagram'],
            'facebook' => ['facebook'], 'x' => ['x'], 'youtube' => ['youtube'],
            'tiktok' => ['tiktok'], 'other' => ['other'],
        ];
    }

    private function linkUrl(CardLink $link): string
    {
        return '/api/v1/cards/'.$link->card_id.'/links/'.$link->id;
    }
}
