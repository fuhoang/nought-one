<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class CardResource extends PublicCardResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            ...parent::toArray($request),
            'links' => CardLinkResource::collection($this->whenLoaded('links')),
            'theme_settings' => $this->theme_settings,
            'is_published' => $this->is_published,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
