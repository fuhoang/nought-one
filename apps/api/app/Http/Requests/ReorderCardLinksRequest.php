<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class ReorderCardLinksRequest extends FormRequest
{
    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('card'));
    }

    public function rules(): array
    {
        return [
            'link_ids' => ['present', 'array', 'list'],
            'link_ids.*' => ['required', 'uuid', 'distinct:ignore_case'],
        ];
    }
}
