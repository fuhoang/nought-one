<?php

namespace Database\Factories;

use App\Models\Card;
use App\Models\CardLink;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<CardLink> */
class CardLinkFactory extends Factory
{
    public function definition(): array
    {
        return [
            'card_id' => Card::factory(),
            'type' => 'website',
            'label' => 'Website',
            'url' => 'https://example.com',
            'position' => 0,
            'is_visible' => true,
        ];
    }

    public function hidden(): static
    {
        return $this->state(fn (array $attributes): array => ['is_visible' => false]);
    }
}
