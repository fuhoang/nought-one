<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_register(): void
    {
        $response = $this->postJson('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'SecurePassword123!',
            'password_confirmation' => 'SecurePassword123!',
        ]);

        $response->assertCreated()
            ->assertJsonPath('user.email', 'test@example.com');

        $this->assertDatabaseHas('users', [
            'email' => 'test@example.com',
        ]);

        $user = User::where('email', 'test@example.com')->firstOrFail();

        $this->assertAuthenticatedAs($user);
    }

    public function test_duplicate_email_is_rejected(): void
    {
        User::factory()->create([
            'email' => 'test@example.com',
        ]);

        $response = $this->postJson('/register', [
            'name' => 'Another User',
            'email' => 'test@example.com',
            'password' => 'SecurePassword123!',
            'password_confirmation' => 'SecurePassword123!',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
    }

    public function test_weak_password_is_rejected(): void
    {
        $response = $this->postJson('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['password']);
    }

    public function test_password_confirmation_is_required(): void
    {
        $response = $this->postJson('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'SecurePassword123!',
            'password_confirmation' => 'DifferentPassword123!',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['password']);
    }
}
