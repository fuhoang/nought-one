<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CardAsset extends Model
{
    use HasUuids;

    protected $fillable = [
        'type',
        'storage_key',
        'mime_type',
        'file_size',
    ];

    public function card(): BelongsTo
    {
        return $this->belongsTo(Card::class);
    }
}
