<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CardAssetResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'mime_type' => $this->mime_type,
            'file_size' => $this->file_size,
            'url' => route('api.v1.cards.assets.content', ['card' => $this->card_id, 'asset' => $this->id]),
        ];
    }
}
