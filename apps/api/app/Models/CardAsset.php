<?php

namespace App\Models;

use Database\Factories\CardAssetFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CardAsset extends Model
{
    /** @use HasFactory<CardAssetFactory> */
    use HasFactory, HasUuids;

    protected $fillable = [
        'type',
        'disk',
        'storage_key',
        'mime_type',
        'file_size',
    ];

    protected function casts(): array
    {
        return ['file_size' => 'integer'];
    }

    public function card(): BelongsTo
    {
        return $this->belongsTo(Card::class);
    }
}
