<?php

namespace Database\Factories;

use App\Models\Card;
use App\Models\CardAsset;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<CardAsset> */
class CardAssetFactory extends Factory
{
    public function definition(): array
    {
        return [
            'card_id' => Card::factory(), 'type' => 'avatar', 'disk' => 'card_assets',
            'storage_key' => 'test/'.Str::uuid().'.png', 'mime_type' => 'image/png', 'file_size' => 100,
        ];
    }
}
