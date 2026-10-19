<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CardEvent extends Model
{
    use HasUuids;

    protected $fillable = [
        'event_type',
        'source',
    ];

    public function card(): BelongsTo
    {
        return $this->belongsTo(Card::class);
    }
}
