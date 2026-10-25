<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicCardAssetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'type' => $this->type,
            'url' => route('api.v1.public.cards.assets.content', ['slug' => $this->card->slug, 'asset' => $this->id]),
        ];
    }
}
