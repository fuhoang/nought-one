<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class CardLinkResource extends PublicCardLinkResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            ...parent::toArray($request),
            'position' => $this->position,
            'is_visible' => $this->is_visible,
        ];
    }
}
