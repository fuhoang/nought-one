<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Card;
use App\Services\CardAssetService;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PublicCardAssetController extends Controller
{
    public function __invoke(string $slug, string $asset, CardAssetService $assets): StreamedResponse
    {
        $card = Card::query()->where('slug', $slug)->where('is_published', true)->firstOrFail();

        return $assets->content($card->assets()->findOrFail($asset));
    }
}
