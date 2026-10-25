<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicCardResource;
use App\Models\Card;

class PublicCardController extends Controller
{
    public function __invoke(string $slug): PublicCardResource
    {
        $card = Card::query()->where('slug', $slug)->where('is_published', true)->with(['links' => fn ($query) => $query->where('is_visible', true)])->firstOrFail();

        return new PublicCardResource($card);
    }
}
