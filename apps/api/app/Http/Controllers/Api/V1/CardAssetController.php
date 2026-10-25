<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCardAssetRequest;
use App\Http\Resources\CardAssetResource;
use App\Models\Card;
use App\Models\CardAsset;
use App\Services\CardAssetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CardAssetController extends Controller
{
    public function index(Card $card): AnonymousResourceCollection
    {
        Gate::authorize('view', $card);

        return CardAssetResource::collection($card->assets()->orderBy('type')->get());
    }

    public function store(StoreCardAssetRequest $request, Card $card, CardAssetService $assets): JsonResponse
    {
        $asset = $assets->store($card, $request->validated('type'), $request->file('file'));

        return (new CardAssetResource($asset))->response()->setStatusCode($asset->wasRecentlyCreated ? 201 : 200);
    }

    public function content(Card $card, CardAsset $asset, CardAssetService $assets): StreamedResponse
    {
        Gate::authorize('view', $card);

        return $assets->content($asset);
    }

    public function destroy(Card $card, CardAsset $asset, CardAssetService $assets): Response
    {
        Gate::authorize('update', $card);
        $assets->delete($card, $asset);

        return response()->noContent();
    }
}
