<?php

namespace App\Http\Requests;

class UpdateCardLinkRequest extends StoreCardLinkRequest
{
    public function rules(): array
    {
        $rules = parent::rules();
        foreach (['type', 'label', 'url'] as $field) {
            array_unshift($rules[$field], 'sometimes');
        }

        return $rules;
    }
}
