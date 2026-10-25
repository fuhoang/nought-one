<?php

namespace App\Services;

use App\Models\AssetFileCleanup;
use App\Models\Card;
use App\Models\CardAsset;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

class CardAssetService
{
    public function __construct(private AssetFileCleaner $cleaner, private AssetImage $images) {}

    public function store(Card $card, string $type, UploadedFile $file): CardAsset
    {
        $image = $this->images->normalize($file);
        $diskName = config('card_assets.disk');
        $key = $card->id.'/'.$type.'/'.Str::uuid().'.'.$image['extension'];
        // A durable intent also covers a process stopping after writing but before linking.
        $pending = AssetFileCleanup::create([
            'disk' => $diskName, 'storage_key' => $key, 'available_at' => now()->addDay(),
        ]);
        $retired = [];

        try {
            if (! Storage::disk($diskName)->put($key, $image['contents'], ['visibility' => 'private'])) {
                throw new HttpException(503, 'Image storage is temporarily unavailable.');
            }

            $asset = $card->getConnection()->transaction(function () use ($card, $type, $diskName, $key, $image, $pending, &$retired): CardAsset {
                $locked = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
                AssetFileCleanup::query()->whereKey($pending->id)->lockForUpdate()->firstOrFail();
                $asset = $locked->assets()->where('type', $type)->first();
                if ($asset) {
                    $retired[] = $this->retire($asset)->id;
                } else {
                    $asset = $locked->assets()->make(['type' => $type]);
                }

                $asset->fill([
                    'disk' => $diskName, 'storage_key' => $key,
                    'mime_type' => $image['mime_type'], 'file_size' => strlen($image['contents']),
                ])->save();
                $pending->delete();

                return $asset;
            });
        } catch (Throwable $exception) {
            // If a commit's outcome is uncertain, the cleaner checks references before deleting.
            try {
                $pending->update(['available_at' => now()]);
                $this->cleaner->clean($pending->id);
            } catch (Throwable $cleanupException) {
                report($cleanupException);
            }
            throw $exception;
        }

        foreach ($retired as $id) {
            $this->cleaner->clean($id);
        }

        return $asset;
    }

    public function delete(Card $card, CardAsset $asset): void
    {
        $id = $card->getConnection()->transaction(function () use ($card, $asset): string {
            $locked = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
            $current = $locked->assets()->findOrFail($asset->id);
            $pending = $this->retire($current);
            $current->delete();

            return $pending->id;
        });

        $this->cleaner->clean($id);
    }

    public function deleteCard(Card $card): void
    {
        $ids = $card->getConnection()->transaction(function () use ($card): array {
            $locked = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
            $ids = [];
            foreach ($locked->assets()->get() as $asset) {
                $ids[] = $this->retire($asset)->id;
            }
            $locked->delete();

            return $ids;
        });

        foreach ($ids as $id) {
            $this->cleaner->clean($id);
        }
    }

    public function content(CardAsset $asset): StreamedResponse
    {
        $disk = Storage::disk($asset->disk);
        abort_unless($disk->exists($asset->storage_key), 404);
        $stream = $disk->readStream($asset->storage_key);
        abort_unless(is_resource($stream), 503, 'Image storage is temporarily unavailable.');

        return response()->stream(function () use ($stream): void {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, 200, [
            'Content-Type' => $asset->mime_type,
            'Content-Length' => (string) $asset->file_size,
            'Content-Disposition' => 'inline',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store, max-age=0',
        ]);
    }

    private function retire(CardAsset $asset): AssetFileCleanup
    {
        return AssetFileCleanup::create([
            'disk' => $asset->disk, 'storage_key' => $asset->storage_key, 'available_at' => now(),
        ]);
    }
}
