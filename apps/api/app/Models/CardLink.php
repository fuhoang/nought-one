<?php

namespace App\Models;

use Database\Factories\CardLinkFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CardLink extends Model
{
    /** @use HasFactory<CardLinkFactory> */
    use HasFactory, HasUuids;

    protected $fillable = [
        'type',
        'label',
        'url',
        'position',
        'is_visible',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
            'is_visible' => 'boolean',
        ];
    }

    public function card(): BelongsTo
    {
        return $this->belongsTo(Card::class);
    }
}
