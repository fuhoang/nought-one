<?php

namespace Tests\Feature\Cards;

use App\Models\AssetFileCleanup;
use App\Models\Card;
use App\Models\CardAsset;
use App\Services\AssetFileCleaner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class CardAssetFailureTest extends TestCase
{
    use RefreshDatabase;

    public function test_failed_partial_write_keeps_existing_image_and_removes_new_file(): void
    {
        $disk = Storage::fake('card_assets');
        $old = CardAsset::factory()->create();
        $disk->put($old->storage_key, 'original');
        $failing = Mockery::mock($disk);
        $failing->shouldReceive('put')->once()->andReturnUsing(function ($key, $contents) use ($disk): bool {
            $disk->put($key, $contents);

            return false;
        });
        Storage::set('card_assets', $failing);

        $this->actingAs($old->card->user)->postJson('/api/v1/cards/'.$old->card_id.'/assets', [
            'type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64),
        ])->assertServiceUnavailable();

        $this->assertDatabaseHas('card_assets', ['id' => $old->id, 'storage_key' => $old->storage_key]);
        $this->assertSame('original', $disk->get($old->storage_key));
        $this->assertSame([$old->storage_key], $disk->allFiles());
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public function test_database_failure_preserves_old_image_and_cleans_new_upload(): void
    {
        $disk = Storage::fake('card_assets');
        $old = CardAsset::factory()->create();
        $disk->put($old->storage_key, 'original');
        CardAsset::updating(function (CardAsset $asset): void {
            throw new RuntimeException('Simulated database failure.');
        });

        $this->actingAs($old->card->user)->postJson('/api/v1/cards/'.$old->card_id.'/assets', [
            'type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64),
        ])->assertInternalServerError();

        $this->assertDatabaseHas('card_assets', ['id' => $old->id, 'storage_key' => $old->storage_key]);
        $this->assertSame('original', $disk->get($old->storage_key));
        $this->assertSame([$old->storage_key], $disk->allFiles());
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public function test_old_image_is_not_deleted_until_replacement_is_stored_and_linked(): void
    {
        $disk = Storage::fake('card_assets');
        $old = CardAsset::factory()->create();
        $disk->put($old->storage_key, 'original');
        $observed = false;
        CardAsset::updating(function (CardAsset $asset) use ($disk, $old, &$observed): void {
            $disk->assertExists($old->storage_key);
            $disk->assertExists($asset->storage_key);
            $this->assertDatabaseHas('card_assets', ['id' => $old->id, 'storage_key' => $old->storage_key]);
            $observed = true;
        });

        $this->actingAs($old->card->user)->postJson('/api/v1/cards/'.$old->card_id.'/assets', [
            'type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64),
        ])->assertOk();

        $this->assertTrue($observed);
        $disk->assertMissing($old->storage_key);
        $disk->assertExists($old->fresh()->storage_key);
    }

    #[DataProvider('cleanupOperations')]
    public function test_storage_deletion_failures_are_durable_and_retryable(string $operation): void
    {
        $disk = Storage::fake('card_assets');
        $old = CardAsset::factory()->create();
        $disk->put($old->storage_key, 'original');
        $card = $old->card;
        $failing = Mockery::mock($disk);
        $failing->shouldReceive('delete')->once()->with($old->storage_key)->andReturn(false);
        Storage::set('card_assets', $failing);
        $this->actingAs($card->user);

        match ($operation) {
            'replacement' => $this->postJson('/api/v1/cards/'.$card->id.'/assets', ['type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64)])->assertOk(),
            'asset deletion' => $this->deleteJson('/api/v1/cards/'.$card->id.'/assets/'.$old->id)->assertNoContent(),
            'card deletion' => $this->deleteJson('/api/v1/cards/'.$card->id)->assertNoContent(),
        };

        $this->assertDatabaseHas('asset_file_cleanups', ['storage_key' => $old->storage_key, 'attempts' => 1]);
        $this->assertDatabaseMissing('card_assets', ['storage_key' => $old->storage_key]);
        $disk->assertExists($old->storage_key);
        Storage::set('card_assets', $disk);
        $this->travel(61)->seconds();
        $this->artisan('assets:cleanup')->assertSuccessful();
        $disk->assertMissing($old->storage_key);
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public static function cleanupOperations(): array
    {
        return [['replacement'], ['asset deletion'], ['card deletion']];
    }

    #[DataProvider('deleteOperations')]
    public function test_database_delete_failure_keeps_records_and_files(string $operation): void
    {
        $disk = Storage::fake('card_assets');
        $old = CardAsset::factory()->create();
        $disk->put($old->storage_key, 'original');
        $this->actingAs($old->card->user);
        if ($operation === 'asset') {
            CardAsset::deleting(function (CardAsset $asset): void {
                throw new RuntimeException('Simulated database failure.');
            });
            $url = '/api/v1/cards/'.$old->card_id.'/assets/'.$old->id;
        } else {
            Card::deleting(function (Card $card): void {
                throw new RuntimeException('Simulated database failure.');
            });
            $url = '/api/v1/cards/'.$old->card_id;
        }

        $this->deleteJson($url)->assertInternalServerError();

        $this->assertModelExists($old);
        $this->assertModelExists($old->card);
        $disk->assertExists($old->storage_key);
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public static function deleteOperations(): array
    {
        return [['asset'], ['card']];
    }

    public function test_cleanup_reclaims_abandoned_uploads_but_not_active_uploads_or_linked_files(): void
    {
        $disk = Storage::fake('card_assets');
        $linked = CardAsset::factory()->create();
        foreach (['abandoned.png', 'active.png', $linked->storage_key] as $key) {
            $disk->put($key, 'image');
        }
        AssetFileCleanup::create(['disk' => 'card_assets', 'storage_key' => 'abandoned.png', 'available_at' => now()->subDay()]);
        AssetFileCleanup::create(['disk' => 'card_assets', 'storage_key' => 'active.png', 'available_at' => now()->addDay()]);
        AssetFileCleanup::create(['disk' => 'card_assets', 'storage_key' => $linked->storage_key, 'available_at' => now()]);

        $this->artisan('assets:cleanup')->assertSuccessful();

        $disk->assertMissing('abandoned.png');
        $disk->assertExists('active.png');
        $disk->assertExists($linked->storage_key);
        $this->assertDatabaseCount('asset_file_cleanups', 1);
        $this->artisan('assets:cleanup')->assertSuccessful();
    }

    public function test_cleanup_is_idempotent_for_already_missing_files(): void
    {
        Storage::fake('card_assets');
        $pending = AssetFileCleanup::create(['disk' => 'card_assets', 'storage_key' => 'missing.png', 'available_at' => now()]);

        $this->assertTrue(app(AssetFileCleaner::class)->clean($pending->id));
        $this->assertTrue(app(AssetFileCleaner::class)->clean($pending->id));
        $this->assertModelMissing($pending);
    }

    public function test_failed_upload_and_failed_cleanup_leave_a_retryable_record(): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        $failing = Mockery::mock($disk);
        $failing->shouldReceive('put')->once()->andReturnUsing(function ($key, $contents) use ($disk): bool {
            $disk->put($key, $contents);

            return false;
        });
        $failing->shouldReceive('delete')->once()->andThrow(new RuntimeException('Storage unavailable.'));
        Storage::set('card_assets', $failing);

        $this->actingAs($card->user)->postJson('/api/v1/cards/'.$card->id.'/assets', [
            'type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64),
        ])->assertServiceUnavailable();

        $this->assertDatabaseCount('card_assets', 0);
        $pending = AssetFileCleanup::sole();
        $this->assertSame(1, $pending->attempts);
        $disk->assertExists($pending->storage_key);
        Storage::set('card_assets', $disk);
        $this->travel(61)->seconds();
        $this->artisan('assets:cleanup')->assertSuccessful();
        $disk->assertMissing($pending->storage_key);
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public function test_failed_initial_database_insert_cleans_unlinked_upload(): void
    {
        $disk = Storage::fake('card_assets');
        $card = Card::factory()->create();
        CardAsset::creating(function (CardAsset $asset): void {
            throw new RuntimeException('Simulated insert failure.');
        });

        $this->actingAs($card->user)->postJson('/api/v1/cards/'.$card->id.'/assets', [
            'type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64),
        ])->assertInternalServerError();

        $this->assertSame([], $disk->allFiles());
        $this->assertDatabaseCount('card_assets', 0);
        $this->assertDatabaseCount('asset_file_cleanups', 0);
    }

    public function test_failed_cleanup_command_returns_failure_and_retains_retry(): void
    {
        $disk = Storage::fake('card_assets');
        $disk->put('retry.png', 'image');
        $pending = AssetFileCleanup::create(['disk' => 'card_assets', 'storage_key' => 'retry.png', 'available_at' => now()]);
        $failing = Mockery::mock($disk);
        $failing->shouldReceive('delete')->once()->andReturn(false);
        Storage::set('card_assets', $failing);

        $this->artisan('assets:cleanup')->assertFailed();

        $this->assertDatabaseHas('asset_file_cleanups', ['id' => $pending->id, 'attempts' => 1]);
        $disk->assertExists('retry.png');
    }

    public function test_existing_assets_keep_original_disk_after_storage_configuration_changes(): void
    {
        $oldDisk = Storage::fake('card_assets');
        $newDisk = Storage::fake('future_private_disk');
        $old = CardAsset::factory()->create();
        $oldDisk->put($old->storage_key, 'old image');
        config(['card_assets.disk' => 'future_private_disk']);

        $this->actingAs($old->card->user)->get('/api/v1/cards/'.$old->card_id.'/assets/'.$old->id.'/content')->assertOk()->assertStreamedContent('old image');
        $this->postJson('/api/v1/cards/'.$old->card_id.'/assets', ['type' => 'avatar', 'file' => UploadedFile::fake()->image('new.png', 64, 64)])->assertOk();

        $oldDisk->assertMissing($old->storage_key);
        $replacement = $old->fresh();
        $this->assertSame('future_private_disk', $replacement->disk);
        $newDisk->assertExists($replacement->storage_key);
    }
}
