<?php

namespace App\Http\Requests;

use App\Models\Card;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreCardRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('create', Card::class);
    }

    public function rules(): array
    {
        return [
            'slug' => ['bail', 'required', 'string', 'max:100', 'regex:/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/', Rule::unique(Card::class, 'slug')],
            'display_name' => ['required', 'string', 'max:150'],
            'job_title' => ['nullable', 'string', 'max:150'],
            'company' => ['nullable', 'string', 'max:150'],
            'bio' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:255'],
            'website' => ['nullable', 'url:http,https', 'max:2048'],
            'location' => ['nullable', 'string', 'max:255'],
            'template_key' => ['sometimes', 'required', Rule::in(['minimal'])],
            'is_published' => ['sometimes', 'required', 'boolean'],
            'theme_settings' => ['missing'],
            'user_id' => ['missing'],
            'id' => ['missing'],
        ];
    }
}
