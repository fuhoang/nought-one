<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCardRequest;
use App\Http\Requests\UpdateCardRequest;
use App\Http\Resources\CardResource;
use App\Models\Card;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class CardController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Card::class);

        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);

        return CardResource::collection(
            $request->user()->cards()->latest()->orderByDesc('id')->paginate(15)
        );
    }

    public function store(StoreCardRequest $request): JsonResponse
    {
        $card = $this->saveCard($request->user()->cards()->make(), $request->validated());

        return (new CardResource($card->load('links')))->response()->setStatusCode(201);
    }

    public function show(Card $card): CardResource
    {
        Gate::authorize('view', $card);

        return new CardResource($card->load('links'));
    }

    public function update(UpdateCardRequest $request, Card $card): CardResource
    {
        return new CardResource($this->saveCard($card, $request->validated())->load('links'));
    }

    public function destroy(Card $card): Response
    {
        Gate::authorize('delete', $card);

        $card->delete();

        return response()->noContent();
    }

    /** @param array<string, mixed> $attributes */
    private function saveCard(Card $card, array $attributes): Card
    {
        try {
            $card->getConnection()->transaction(fn (): bool => $card->fill($attributes)->save());
        } catch (UniqueConstraintViolationException $exception) {
            if (! str_contains($exception->getMessage(), 'cards_slug_unique')) {
                throw $exception;
            }

            throw ValidationException::withMessages(['slug' => 'The slug has already been taken.']);
        }

        return $card->refresh();
    }
}
