<?php

namespace App\Services;

use App\Models\AssetFileCleanup;
use App\Models\CardAsset;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class AssetFileCleaner
{
    public function clean(string $id): bool
    {
        try {
            return AssetFileCleanup::query()->getConnection()->transaction(function () use ($id): bool {
                $cleanup = AssetFileCleanup::query()->whereKey($id)->lockForUpdate()->first();
                if (! $cleanup || $cleanup->available_at->isFuture()) {
                    return true;
                }

                if (CardAsset::query()->where('disk', $cleanup->disk)->where('storage_key', $cleanup->storage_key)->exists()) {
                    $cleanup->delete();

                    return true;
                }

                $disk = Storage::disk($cleanup->disk);
                if ($disk->exists($cleanup->storage_key) && ! $disk->delete($cleanup->storage_key)) {
                    throw new RuntimeException('Asset file deletion failed.');
                }

                $cleanup->delete();

                return true;
            });
        } catch (Throwable $exception) {
            report($exception);
            try {
                AssetFileCleanup::query()->whereKey($id)->increment('attempts', 1, ['available_at' => now()->addMinute()]);
            } catch (Throwable $retryException) {
                report($retryException);
            }

            return false;
        }
    }
}
