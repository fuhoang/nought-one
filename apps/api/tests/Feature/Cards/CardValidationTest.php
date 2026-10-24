<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CardValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_missing_required_fields_return_422_without_creating_a_card(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/v1/cards', [])
            ->assertUnprocessable()->assertJsonValidationErrors([
                'slug' => 'The slug field is required.',
                'display_name' => 'The display name field is required.',
            ]);

        $this->assertDatabaseCount('cards', 0);
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_create_fields_return_422(string $field, mixed $value, string $message): void
    {
        $payload = ['slug' => 'valid-slug', 'display_name' => 'Alex Smith', $field => $value];

        $this->actingAs(User::factory()->create())->postJson('/api/v1/cards', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);

        $this->assertDatabaseCount('cards', 0);
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_update_fields_return_422_without_modifying_card(string $field, mixed $value, string $message): void
    {
        $card = Card::factory()->create();
        $original = $card->refresh()->getAttributes();

        $this->actingAs($card->user)->patchJson('/api/v1/cards/'.$card->id, [$field => $value])
            ->assertUnprocessable()->assertJsonValidationErrors([$field => $message]);

        $this->assertSame($original, $card->fresh()->getAttributes());
    }

    public static function invalidFields(): array
    {
        $cases = [
            'uppercase slug' => ['slug', 'Alex', 'The slug field format is invalid.'],
            'slug punctuation' => ['slug', 'alex--smith', 'The slug field format is invalid.'],
            'empty slug' => ['slug', null, 'The slug field is required.'],
            'empty name' => ['display_name', '', 'The display name field is required.'],
            'invalid email' => ['email', 'not-an-email', 'The email field must be a valid email address.'],
            'unsafe website' => ['website', 'javascript:alert(1)', 'The website field must be a valid URL.'],
            'invalid publication' => ['is_published', 'yes', 'The is published field must be true or false.'],
            'null publication' => ['is_published', null, 'The is published field is required.'],
            'unsupported template' => ['template_key', 'premium', 'The selected template key is invalid.'],
            'theme edits' => ['theme_settings', ['color' => 'red'], 'The theme settings field must be missing.'],
            'ownership' => ['user_id', '00000000-0000-4000-8000-000000000001', 'The user id field must be missing.'],
            'id injection' => ['id', '00000000-0000-4000-8000-000000000001', 'The id field must be missing.'],
            'non-text bio' => ['bio', ['unexpected'], 'The bio field must be a string.'],
        ];
        foreach (['slug' => 100, 'display_name' => 150, 'job_title' => 150, 'company' => 150, 'phone' => 30, 'location' => 255] as $field => $max) {
            $label = str_replace('_', ' ', $field);
            $cases[$field.' too long'] = [$field, str_repeat('a', $max + 1), "The {$label} field must not be greater than {$max} characters."];
        }

        return $cases;
    }

    public function test_duplicate_slug_returns_422_for_create_and_update(): void
    {
        Card::factory()->create(['slug' => 'reserved-slug']);
        $card = Card::factory()->create(['slug' => 'my-slug']);
        $this->actingAs($card->user);

        $this->postJson('/api/v1/cards', ['slug' => 'reserved-slug', 'display_name' => 'Alex'])
            ->assertUnprocessable()->assertJsonValidationErrors(['slug' => 'The slug has already been taken.']);
        $this->patchJson('/api/v1/cards/'.$card->id, ['slug' => 'reserved-slug'])
            ->assertUnprocessable()->assertJsonValidationErrors(['slug' => 'The slug has already been taken.']);

        $this->assertDatabaseCount('cards', 2);
        $this->assertDatabaseHas('cards', ['id' => $card->id, 'slug' => 'my-slug']);
    }

    public function test_all_supported_fields_are_saved_and_unknown_fields_are_ignored(): void
    {
        $payload = [
            'slug' => 'alex-smith', 'display_name' => 'Alex Smith', 'job_title' => 'Designer',
            'company' => 'Acme', 'bio' => 'Hello', 'phone' => '+44 1234 567890',
            'email' => 'alex@example.com', 'website' => 'https://example.com',
            'location' => 'London', 'template_key' => 'minimal', 'is_published' => true,
        ];
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/v1/cards', [...$payload, 'created_at' => '2000-01-01', 'unexpected' => 'ignored']);

        $response->assertCreated()->assertJson(['data' => $payload])->assertJsonMissingPath('data.unexpected');
        $this->assertDatabaseHas('cards', [...$payload, 'user_id' => $user->id]);
        $this->assertNotSame('2000-01-01', substr($response->json('data.created_at'), 0, 10));
    }

    public function test_slug_claimed_after_validation_returns_422_without_partial_writes(): void
    {
        $user = User::factory()->create();
        Card::creating(function (Card $card): void {
            DB::table('cards')->insert([
                'id' => (string) Str::uuid(), 'user_id' => $card->user_id,
                'slug' => $card->slug, 'display_name' => 'Competing card',
            ]);
        });

        $this->actingAs($user)->postJson('/api/v1/cards', [
            'slug' => 'claimed-slug', 'display_name' => 'Alex',
        ])->assertUnprocessable()->assertJsonValidationErrors(['slug' => 'The slug has already been taken.']);

        $this->assertDatabaseCount('cards', 0);
    }

    public function test_update_slug_collision_after_validation_returns_422_and_rolls_back(): void
    {
        $card = Card::factory()->create(['slug' => 'my-slug']);
        $other = Card::factory()->create(['slug' => 'other-slug']);
        Card::updating(function (Card $updatingCard) use ($other): void {
            DB::table('cards')->where('id', $other->id)->update(['slug' => $updatingCard->slug]);
        });

        $this->actingAs($card->user)->patchJson('/api/v1/cards/'.$card->id, ['slug' => 'claimed-slug'])
            ->assertUnprocessable()->assertJsonValidationErrors(['slug' => 'The slug has already been taken.']);

        $this->assertDatabaseHas('cards', ['id' => $card->id, 'slug' => 'my-slug']);
        $this->assertDatabaseHas('cards', ['id' => $other->id, 'slug' => 'other-slug']);
    }

    public function test_invalid_pagination_returns_422(): void
    {
        $this->actingAs(User::factory()->create())->getJson('/api/v1/cards?page=0')
            ->assertUnprocessable()->assertJsonValidationErrors(['page' => 'The page field must be at least 1.']);
    }
}
