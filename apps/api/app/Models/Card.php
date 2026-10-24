<?php

namespace App\Models;

use Database\Factories\CardFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Card extends Model
{
    /** @use HasFactory<CardFactory> */
    use HasFactory, HasUuids;

    protected $fillable = [
        'slug',
        'display_name',
        'job_title',
        'company',
        'bio',
        'phone',
        'email',
        'website',
        'location',
        'template_key',
        'theme_settings',
        'is_published',
    ];

    protected function casts(): array
    {
        return [
            'theme_settings' => 'array',
            'is_published' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function links(): HasMany
    {
        return $this->hasMany(CardLink::class);
    }

    public function assets(): HasMany
    {
        return $this->hasMany(CardAsset::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(CardEvent::class);
    }
}
