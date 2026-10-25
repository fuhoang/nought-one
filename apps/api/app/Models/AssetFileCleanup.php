<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AssetFileCleanup extends Model
{
    use HasUuids;

    protected $fillable = ['disk', 'storage_key', 'available_at', 'attempts'];

    protected function casts(): array
    {
        return ['available_at' => 'datetime', 'attempts' => 'integer'];
    }
}
