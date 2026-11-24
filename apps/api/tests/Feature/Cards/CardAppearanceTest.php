<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CardAppearanceTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('appearances')]
    public function test_owner_can_create_and_update_supported_appearances(string $template, string $mode, string $accent): void
    {
        $user = User::factory()->create();
        $appearance = ['template_key' => $template, 'theme_settings' => ['mode' => $mode, 'accent' => $accent]];

        $response = $this->actingAs($user)->postJson('/api/v1/cards', [
            'slug' => 'my-card', 'display_name' => 'Alex', ...$appearance,
        ])->assertCreated()->assertJsonPath('data.theme_settings', $appearance['theme_settings']);
        $created = Card::findOrFail($response->json('data.id'));
        $this->assertSame($template, $created->template_key);
        $this->assertSame($appearance['theme_settings'], $created->theme_settings);

        $card = Card::factory()->for($user)->published()->create();
        $this->patchJson('/api/v1/cards/'.$card->id, $appearance)->assertOk();
        $this->assertSame($template, $card->refresh()->template_key);
        $this->assertSame($appearance['theme_settings'], $card->theme_settings);
        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertOk()
            ->assertJsonPath('data.template_key', $template)
            ->assertJsonPath('data.theme_settings', $appearance['theme_settings']);
    }

    public static function appearances(): iterable
    {
        foreach (['minimal', 'centered', 'compact'] as $template) {
            foreach (['light', 'dark'] as $mode) {
                foreach (['neutral', 'slate', 'forest', 'navy'] as $accent) {
                    yield "$template/$mode/$accent" => [$template, $mode, $accent];
                }
            }
        }
    }

    #[DataProvider('invalidThemes')]
    public function test_invalid_appearance_is_rejected_without_partial_writes(mixed $theme, string $field): void
    {
        $card = Card::factory()->create(['theme_settings' => ['mode' => 'dark', 'accent' => 'navy']]);
        $this->actingAs($card->user);
        $original = $card->refresh()->getAttributes();
        $payload = ['display_name' => 'Must not save', 'theme_settings' => $theme];

        $this->postJson('/api/v1/cards', ['slug' => 'invalid-card', ...$payload])
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseMissing('cards', ['slug' => 'invalid-card']);
        $this->patchJson('/api/v1/cards/'.$card->id, $payload)
            ->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertSame($original, $card->refresh()->getAttributes());
    }

    public static function invalidThemes(): array
    {
        return [
            'string' => ['dark', 'theme_settings'],
            'list' => [['dark', 'forest'], 'theme_settings'],
            'empty' => [[], 'theme_settings'],
            'missing mode' => [['accent' => 'forest'], 'theme_settings'],
            'missing accent' => [['mode' => 'dark'], 'theme_settings'],
            'unknown key' => [['mode' => 'light', 'accent' => 'neutral', 'css' => 'url(https://example.com)'], 'theme_settings'],
            'unsupported mode' => [['mode' => 'system', 'accent' => 'neutral'], 'theme_settings.mode'],
            'arbitrary colour' => [['mode' => 'light', 'accent' => '#ff0000'], 'theme_settings.accent'],
            'nested mode' => [['mode' => ['dark'], 'accent' => 'neutral'], 'theme_settings.mode'],
            'null accent' => [['mode' => 'dark', 'accent' => null], 'theme_settings.accent'],
        ];
    }

    public function test_omission_preserves_appearance_and_null_resets_only_theme(): void
    {
        $card = Card::factory()->create(['template_key' => 'centered', 'theme_settings' => ['mode' => 'dark', 'accent' => 'forest']]);
        $this->actingAs($card->user)->patchJson('/api/v1/cards/'.$card->id, ['bio' => 'New bio'])
            ->assertOk()->assertJsonPath('data.theme_settings', ['mode' => 'dark', 'accent' => 'forest']);
        $this->assertSame('centered', $card->refresh()->template_key);
        $this->assertSame(['mode' => 'dark', 'accent' => 'forest'], $card->theme_settings);

        $this->patchJson('/api/v1/cards/'.$card->id, ['theme_settings' => null])
            ->assertOk()->assertJsonPath('data.theme_settings', null);
        $this->assertNull($card->refresh()->theme_settings);
        $this->assertSame('centered', $card->template_key);
        $this->assertSame('New bio', $card->bio);
    }

    public function test_public_projection_defaults_legacy_values_and_never_exposes_unknown_keys(): void
    {
        $card = Card::factory()->published()->create(['theme_settings' => [
            'mode' => ['invalid'], 'accent' => 'forest', 'private_future_setting' => 'secret',
        ]]);

        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertOk()
            ->assertJsonPath('data.theme_settings', ['mode' => 'light', 'accent' => 'forest'])
            ->assertJsonMissing(['private_future_setting' => 'secret']);
        $this->assertSame('secret', $card->refresh()->theme_settings['private_future_setting']);
    }

    public function test_appearance_remains_owned_and_draft_public_access_stays_denied(): void
    {
        $card = Card::factory()->create();
        $payload = ['template_key' => 'compact', 'theme_settings' => ['mode' => 'dark', 'accent' => 'slate']];
        $this->patchJson('/api/v1/cards/'.$card->id, $payload)->assertUnauthorized();
        $this->actingAs(User::factory()->create())->patchJson('/api/v1/cards/'.$card->id, $payload)->assertNotFound();
        $this->assertNull($card->refresh()->theme_settings);
        $this->actingAs($card->user)->patchJson('/api/v1/cards/'.$card->id, $payload)->assertOk();
        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertNotFound();
    }
}
