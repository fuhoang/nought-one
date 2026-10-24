<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_logout(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson('/logout');

        $response->assertOk()
            ->assertJsonPath(
                'message',
                'Logged out successfully.'
            );

        $this->assertGuest();

        $this->getJson('/api/v1/me')
            ->assertUnauthorized();
    }

    public function test_guest_cannot_logout(): void
    {
        $this->postJson('/logout')
            ->assertUnauthorized();
    }
}
