<?php

namespace App\Policies;

use App\Models\Card;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class CardPolicy
{
    public function viewAny(User $user): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return true;
    }

    public function view(User $user, Card $card): Response
    {
        return $user->id === $card->user_id
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    public function update(User $user, Card $card): Response
    {
        return $this->view($user, $card);
    }

    public function delete(User $user, Card $card): Response
    {
        return $this->view($user, $card);
    }
}
