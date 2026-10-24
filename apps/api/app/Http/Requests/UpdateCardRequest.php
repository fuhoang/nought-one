<?php

namespace App\Http\Requests;

use App\Models\Card;
use Illuminate\Auth\Access\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class UpdateCardRequest extends StoreCardRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    public function rules(): array
    {
        $rules = parent::rules();
        array_unshift($rules['slug'], 'sometimes');
        array_unshift($rules['display_name'], 'sometimes');
        $rules['slug'][array_key_last($rules['slug'])] = Rule::unique(Card::class, 'slug')->ignore($this->route('card'));

        return $rules;
    }
}
