<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreCardAssetRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(['avatar', 'logo'])],
            'file' => ['bail', 'required', 'file', 'max:2048', 'mimetypes:image/jpeg,image/png,image/webp', 'image', 'dimensions:min_width=32,min_height=32,max_width=2048,max_height=2048'],
            'id' => ['missing'], 'card_id' => ['missing'], 'disk' => ['missing'],
            'storage_key' => ['missing'], 'mime_type' => ['missing'], 'file_size' => ['missing'],
        ];
    }
}
