<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReorderCardLinksRequest;
use App\Http\Requests\StoreCardLinkRequest;
use App\Http\Requests\UpdateCardLinkRequest;
use App\Http\Resources\CardLinkResource;
use App\Models\Card;
use App\Models\CardLink;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class CardLinkController extends Controller
{
    public function index(Card $card): AnonymousResourceCollection
    {
        Gate::authorize('view', $card);

        return CardLinkResource::collection($card->links()->get());
    }

    public function store(StoreCardLinkRequest $request, Card $card): JsonResponse
    {
        $link = $card->getConnection()->transaction(function () use ($request, $card): CardLink {
            $lockedCard = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
            $position = $lockedCard->links()->max('position');

            return $lockedCard->links()->create([
                ...$request->validated(),
                'position' => $position === null ? 0 : $position + 1,
            ])->refresh();
        });

        return (new CardLinkResource($link))->response()->setStatusCode(201);
    }

    public function update(UpdateCardLinkRequest $request, Card $card, CardLink $link): CardLinkResource
    {
        $updated = $card->getConnection()->transaction(function () use ($request, $card, $link): CardLink {
            $lockedCard = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
            $currentLink = $lockedCard->links()->findOrFail($link->id);
            $currentLink->update($request->validated());

            return $currentLink->refresh();
        });

        return new CardLinkResource($updated);
    }

    public function destroy(Card $card, CardLink $link): Response
    {
        Gate::authorize('update', $card);

        $card->getConnection()->transaction(function () use ($card, $link): void {
            $lockedCard = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
            $lockedCard->links()->findOrFail($link->id)->delete();
            foreach ($lockedCard->links()->get() as $position => $remaining) {
                $remaining->update(['position' => $position]);
            }
        });

        return response()->noContent();
    }

    public function reorder(ReorderCardLinksRequest $request, Card $card): AnonymousResourceCollection
    {
        $links = $card->getConnection()->transaction(function () use ($request, $card): Collection {
            $lockedCard = Card::query()->whereKey($card->id)->lockForUpdate()->firstOrFail();
            $links = $lockedCard->links()->get()->keyBy('id');
            $ids = array_map('strtolower', $request->validated('link_ids'));
            $expected = $links->keys()->sort()->values()->all();
            $submitted = $ids;
            sort($submitted);

            if ($submitted !== $expected) {
                throw ValidationException::withMessages([
                    'link_ids' => 'Provide every link belonging to this card exactly once.',
                ]);
            }

            foreach ($ids as $position => $id) {
                $links[$id]->update(['position' => $position]);
            }

            return $lockedCard->links()->get();
        });

        return CardLinkResource::collection($links);
    }
}
