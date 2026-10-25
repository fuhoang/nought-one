<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreCardLinkRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::in(['website', 'linkedin', 'instagram', 'facebook', 'x', 'youtube', 'tiktok', 'other'])],
            'label' => ['required', 'string', 'max:100'],
            'url' => ['required', 'url:http,https', 'max:2048'],
            'is_visible' => ['sometimes', 'required', 'boolean'],
            'position' => ['missing'],
            'card_id' => ['missing'],
            'id' => ['missing'],
        ];
    }
}
