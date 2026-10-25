<?php

namespace App\Console\Commands;

use App\Models\AssetFileCleanup;
use App\Services\AssetFileCleaner;
use Illuminate\Console\Command;

class CleanupAssetFiles extends Command
{
    protected $signature = 'assets:cleanup';

    protected $description = 'Retry pending private asset file deletions and abandoned uploads';

    public function handle(AssetFileCleaner $cleaner): int
    {
        $failed = false;
        AssetFileCleanup::query()->where('available_at', '<=', now())->chunkById(100, function ($items) use ($cleaner, &$failed): void {
            foreach ($items as $item) {
                if (! $cleaner->clean($item->id)) {
                    $failed = true;
                }
            }
        });

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
