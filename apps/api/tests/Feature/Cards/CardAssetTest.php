<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use App\Models\CardAsset;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CardAssetTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('formats')]
    public function test_uploads_private_images_with_content_derived_metadata(string $extension, string $mime): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $file = UploadedFile::fake()->image('untrusted.'.$extension, 100, 100);

        $response = $this->actingAs($card->user)->postJson($this->assetsUrl($card), ['type' => 'avatar', 'file' => $file]);

        $response->assertCreated()->assertJsonPath('data.type', 'avatar')->assertJsonPath('data.mime_type', $mime)
            ->assertJsonMissingPath('data.storage_key')->assertJsonMissingPath('data.disk');
        $asset = CardAsset::findOrFail($response->json('data.id'));
        $disk->assertExists($asset->storage_key);
        $this->assertSame('private', $disk->getVisibility($asset->storage_key));
        $this->assertSame($disk->size($asset->storage_key), $response->json('data.file_size'));
        $this->assertSame($card->id, $asset->card_id);
        $this->assertStringNotContainsString('untrusted', $asset->storage_key);
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public static function formats(): array
    {
        return ['jpeg' => ['jpg', 'image/jpeg'], 'png' => ['png', 'image/png'], 'webp' => ['webp', 'image/webp']];
    }

    public function test_replacement_keeps_one_asset_per_type_and_cleans_old_file(): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $this->actingAs($card->user);
        $first = $this->postJson($this->assetsUrl($card), ['type' => 'avatar', 'file' => UploadedFile::fake()->image('first.png', 64, 64)])->assertCreated();
        $old = CardAsset::findOrFail($first->json('data.id'));
        $oldKey = $old->storage_key;

        $second = $this->postJson($this->assetsUrl($card), ['type' => 'avatar', 'file' => UploadedFile::fake()->image('second.jpg', 128, 128)]);

        $second->assertOk()->assertJsonPath('data.id', $old->id)->assertJsonPath('data.mime_type', 'image/jpeg');
        $disk->assertMissing($oldKey);
        $disk->assertExists($old->fresh()->storage_key);
        $this->assertDatabaseCount('card_assets', 1);
        $this->postJson($this->assetsUrl($card), ['type' => 'logo', 'file' => UploadedFile::fake()->image('logo.png', 64, 64)])->assertCreated();
        $this->getJson($this->assetsUrl($card))->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/cards/'.$card->id)->assertOk()->assertJsonCount(2, 'data.assets')->assertJsonPath('data.assets.0.type', 'avatar');
    }

    public function test_owner_can_preview_draft_but_public_access_requires_current_publication(): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $response = $this->actingAs($card->user)->postJson($this->assetsUrl($card), ['type' => 'avatar', 'file' => UploadedFile::fake()->image('photo.png', 64, 64)])->assertCreated();
        $asset = CardAsset::findOrFail($response->json('data.id'));
        $public = '/api/v1/public/cards/'.$card->slug.'/assets/'.$asset->id;

        $preview = $this->get($response->json('data.url'))->assertOk()->assertHeader('Content-Type', 'image/png')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('no-store', $preview->headers->get('Cache-Control'));
        $this->assertSame($disk->get($asset->storage_key), $preview->streamedContent());
        $this->getJson($public)->assertNotFound();
        $this->patchJson('/api/v1/cards/'.$card->id, ['is_published' => true])->assertOk();
        $this->postJson('/logout')->assertOk();
        $publicResponse = $this->get($public)->assertOk();
        $this->assertStringContainsString('no-store', $publicResponse->headers->get('Cache-Control'));
        $this->assertSame($disk->get($asset->storage_key), $publicResponse->streamedContent());
        $this->getJson('/api/v1/public/cards/'.$card->slug)->assertOk()->assertJsonPath('data.assets.0.type', 'avatar')
            ->assertJsonMissingPath('data.assets.0.storage_key')->assertJsonMissingPath('data.assets.0.id');
        $this->actingAs($card->user)->patchJson('/api/v1/cards/'.$card->id, ['is_published' => false])->assertOk();
        $this->getJson($public)->assertNotFound();
    }

    public function test_individual_and_parent_deletion_remove_files(): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $avatar = CardAsset::factory()->for($card)->create();
        $logo = CardAsset::factory()->for($card)->create(['type' => 'logo']);
        $other = CardAsset::factory()->create();
        foreach ([$avatar, $logo, $other] as $asset) {
            $disk->put($asset->storage_key, 'image');
        }

        $this->actingAs($card->user)->deleteJson($this->assetsUrl($card).'/'.$avatar->id)->assertNoContent();
        $disk->assertMissing($avatar->storage_key);
        $this->assertModelMissing($avatar);
        $this->deleteJson('/api/v1/cards/'.$card->id)->assertNoContent();

        $disk->assertMissing($logo->storage_key);
        $disk->assertExists($other->storage_key);
        $this->assertModelMissing($logo);
        $this->assertModelMissing($card);
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    #[DataProvider('privateEndpoints')]
    public function test_guests_and_other_users_cannot_access_asset_endpoints(string $method, string $suffix): void
    {
        Storage::fake('card_assets');
        $asset = CardAsset::factory()->create();
        $url = $this->assetsUrl($asset->card).str_replace('{id}', $asset->id, $suffix);

        $this->json($method, $url)->assertUnauthorized();
        $this->actingAs(User::factory()->create())->json($method, $url)->assertNotFound();

        $this->assertModelExists($asset);
    }

    public static function privateEndpoints(): array
    {
        return ['list' => ['GET', ''], 'upload' => ['POST', ''], 'preview' => ['GET', '/{id}/content'], 'delete' => ['DELETE', '/{id}']];
    }

    public function test_assets_cannot_be_requested_under_another_card_even_for_same_owner(): void
    {
        Storage::fake('card_assets');
        $asset = CardAsset::factory()->create();
        $other = Card::factory()->for($asset->card->user)->published()->create();

        $this->actingAs($other->user)->getJson($this->assetsUrl($other).'/'.$asset->id.'/content')->assertNotFound();
        $this->deleteJson($this->assetsUrl($other).'/'.$asset->id)->assertNotFound();
        $this->getJson('/api/v1/public/cards/'.$other->slug.'/assets/'.$asset->id)->assertNotFound();

        $this->assertModelExists($asset);
    }

    #[DataProvider('invalidImages')]
    public function test_invalid_images_return_422_without_storing_files(string $kind): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $file = match ($kind) {
            'oversized' => UploadedFile::fake()->image('large.png', 64, 64)->size(2049),
            'too small' => UploadedFile::fake()->image('small.png', 31, 32),
            'too wide' => UploadedFile::fake()->image('wide.png', 2049, 32),
            'too tall' => UploadedFile::fake()->image('tall.png', 32, 2049),
            'svg' => UploadedFile::fake()->createWithContent('image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>'),
            'gif' => UploadedFile::fake()->image('image.gif', 64, 64),
            'spoofed' => UploadedFile::fake()->createWithContent('image.jpg', '<?php echo "bad";'),
            'truncated' => UploadedFile::fake()->createWithContent('broken.png', substr(UploadedFile::fake()->image('image.png', 64, 64)->getContent(), 0, 33)),
            'empty' => UploadedFile::fake()->createWithContent('empty.png', ''),
        };

        $this->actingAs($card->user)->postJson($this->assetsUrl($card), ['type' => 'avatar', 'file' => $file])
            ->assertUnprocessable()->assertJsonValidationErrors('file');

        $this->assertDatabaseCount('card_assets', 0);
        $this->assertSame([], $disk->allFiles());
    }

    public static function invalidImages(): array
    {
        return array_map(fn (string $kind): array => [$kind], ['oversized', 'too small', 'too wide', 'too tall', 'svg', 'gif', 'spoofed', 'empty', 'truncated']);
    }

    public function test_required_fields_and_unsupported_type_return_422(): void
    {
        Storage::fake('card_assets');
        $card = Card::factory()->create();

        $this->actingAs($card->user)->postJson($this->assetsUrl($card), [])->assertUnprocessable()->assertJsonValidationErrors(['type', 'file']);
        $this->postJson($this->assetsUrl($card), ['type' => 'banner', 'file' => UploadedFile::fake()->image('photo.png', 64, 64)])
            ->assertUnprocessable()->assertJsonValidationErrors('type');
        $this->assertDatabaseCount('card_assets', 0);
    }

    #[DataProvider('protectedFields')]
    public function test_storage_and_ownership_fields_cannot_be_supplied(string $field): void
    {
        Storage::fake('card_assets');
        $card = Card::factory()->create();

        $this->actingAs($card->user)->postJson($this->assetsUrl($card), [
            'type' => 'avatar', 'file' => UploadedFile::fake()->image('image.png', 64, 64), $field => 'untrusted',
        ])->assertUnprocessable()->assertJsonValidationErrors($field);

        $this->assertDatabaseCount('card_assets', 0);
    }

    public static function protectedFields(): array
    {
        return array_map(fn (string $field): array => [$field], ['id', 'card_id', 'disk', 'storage_key', 'mime_type', 'file_size']);
    }

    public function test_reencoding_removes_trailing_embedded_content(): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $bytes = UploadedFile::fake()->image('image.png', 64, 64)->getContent().'untrusted-trailing-payload';

        $response = $this->actingAs($card->user)->postJson($this->assetsUrl($card), [
            'type' => 'avatar', 'file' => UploadedFile::fake()->createWithContent('photo.png', $bytes),
        ])->assertCreated();

        $asset = CardAsset::findOrFail($response->json('data.id'));
        $this->assertStringNotContainsString('untrusted-trailing-payload', $disk->get($asset->storage_key));
    }

    public function test_missing_file_returns_404(): void
    {
        Storage::fake('card_assets');
        $card = Card::factory()->published()->create();
        $asset = CardAsset::factory()->for($card)->create();

        $this->actingAs($card->user)->getJson($this->assetsUrl($card).'/'.$asset->id.'/content')->assertNotFound();
        $this->getJson('/api/v1/public/cards/'.$card->slug.'/assets/'.$asset->id)->assertNotFound();
    }

    private function assetsUrl(Card $card): string
    {
        return '/api/v1/cards/'.$card->id.'/assets';
    }
}
