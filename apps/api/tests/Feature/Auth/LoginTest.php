<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_login(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('SecurePassword123!'),
        ]);

        $response = $this->postJson('/login', [
            'email' => $user->email,
            'password' => 'SecurePassword123!',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id);

        $this->assertAuthenticatedAs($user);
    }

    public function test_invalid_password_is_rejected(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('SecurePassword123!'),
        ]);

        $response = $this->postJson('/login', [
            'email' => $user->email,
            'password' => 'WrongPassword123!',
        ]);

        $response->assertUnprocessable();

        $this->assertGuest();
    }

    public function test_unknown_email_is_rejected(): void
    {
        $response = $this->postJson('/login', [
            'email' => 'unknown@example.com',
            'password' => 'SecurePassword123!',
        ]);

        $response->assertUnprocessable();

        $this->assertGuest();
    }

    public function test_authenticated_user_can_access_profile(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->getJson('/api/v1/me');

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id);
    }

    public function test_guest_cannot_access_profile(): void
    {
        $this->getJson('/api/v1/me')
            ->assertUnauthorized();
    }
}
