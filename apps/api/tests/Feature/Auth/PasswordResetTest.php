<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use RuntimeException;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_reset_email_uses_website_url_and_does_not_reveal_account_existence(): void
    {
        Notification::fake();
        config(['app.frontend_url' => 'https://cards.example']);
        $user = User::factory()->create();
        $known = $this->postJson('/forgot-password', ['email' => $user->email])->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $unknown = $this->postJson('/forgot-password', ['email' => 'unknown@example.com'])->assertOk();
        $this->assertSame($known->json(), $unknown->json());
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user): bool {
            $url = $notification->toMail($user)->actionUrl;
            $this->assertStringStartsWith('https://cards.example/reset-password?', $url);
            parse_str(parse_url($url, PHP_URL_QUERY), $parameters);
            $this->assertSame($user->email, $parameters['email']);
            $this->assertTrue(Password::tokenExists($user, $parameters['token']));
            $this->assertNotSame($parameters['token'], DB::table('password_reset_tokens')->where('email', $user->email)->value('token'));

            return true;
        });
        $this->postJson('/forgot-password', ['email' => $user->email])->assertOk()->assertExactJson($known->json());
        Notification::assertSentToTimes($user, ResetPassword::class, 1);
    }

    public function test_delivery_failure_is_reported_without_revealing_the_account(): void
    {
        $user = User::factory()->create();
        Exceptions::fake();
        $this->mock(Dispatcher::class)->shouldReceive('send')->once()->andThrow(new RuntimeException('Mail unavailable'));
        $response = $this->postJson('/forgot-password', ['email' => $user->email])->assertOk();
        $unknown = $this->postJson('/forgot-password', ['email' => 'unknown@example.com'])->assertOk();
        $this->assertSame($response->json(), $unknown->json());
        Exceptions::assertReported(RuntimeException::class);
    }

    public function test_password_reset_revokes_old_sessions_and_allows_new_login(): void
    {
        $this->withHeaders(['Origin' => 'http://localhost:3000']);
        $user = User::factory()->create(['password' => Hash::make('OldPassword123!')]);
        $this->postJson('/login', ['email' => $user->email, 'password' => 'OldPassword123!'])->assertOk();
        $this->getJson('/api/v1/me')->assertOk();
        $token = Password::createToken($user);
        $this->postJson('/reset-password', $this->payload($user, $token))->assertOk();
        $this->assertTrue(Hash::check('NewPassword123!', $user->fresh()->password));
        $this->assertSame(1, $user->fresh()->auth_version);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
        $this->app['auth']->shouldUse('web');
        $this->postJson('/login', ['email' => $user->email, 'password' => 'OldPassword123!'])->assertUnprocessable();
        $this->postJson('/login', ['email' => $user->email, 'password' => 'NewPassword123!'])->assertOk();
        $this->getJson('/api/v1/me')->assertOk();
    }

    public function test_sessions_created_before_version_tracking_are_revoked_after_reset(): void
    {
        $user = User::factory()->create();
        $this->withHeaders(['Origin' => 'http://localhost:3000']);
        $this->actingAs($user, 'web')->getJson('/api/v1/me')->assertOk();
        $this->postJson('/reset-password', $this->payload($user, Password::createToken($user)))->assertOk();
        $this->actingAs($user->fresh(), 'web')->getJson('/api/v1/cards')->assertUnauthorized();
    }

    public function test_expired_incorrect_and_reused_tokens_do_not_change_passwords(): void
    {
        $this->freezeTime();
        $user = User::factory()->create();
        $original = $user->password;
        $token = Password::createToken($user);
        $this->travel(61)->minutes();
        $this->postJson('/reset-password', $this->payload($user, $token))->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->assertSame($original, $user->fresh()->password);
        $token = Password::createToken($user);
        $this->postJson('/reset-password', $this->payload($user, 'incorrect'))->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->postJson('/reset-password', $this->payload($user, $token))->assertOk();
        $this->travel(1)->minutes();
        $this->postJson('/reset-password', $this->payload($user, $token))->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->assertSame(1, $user->fresh()->auth_version);
    }

    public function test_reset_token_cannot_be_used_for_another_account(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $this->postJson('/reset-password', $this->payload($other, Password::createToken($owner)))->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->assertSame($other->password, $other->fresh()->password);
    }

    public function test_recovery_validates_input_and_rate_limits_requests(): void
    {
        $this->postJson('/forgot-password', ['email' => 'invalid'])->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/reset-password', [])->assertUnprocessable()->assertHeader('Cache-Control', 'no-store, private')->assertJsonValidationErrors(['token', 'email', 'password']);
        $user = User::factory()->create();
        $token = Password::createToken($user);
        $this->postJson('/reset-password', [...$this->payload($user, $token), 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/reset-password', [...$this->payload($user, $token), 'password_confirmation' => 'DifferentPassword123!'])->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/reset-password', $this->payload($user, $token))->assertOk();
        $this->postJson('/forgot-password', ['email' => $user->email])->assertTooManyRequests()->assertHeader('Retry-After');
    }

    public function test_logging_in_with_the_new_password_refreshes_an_old_session_hash(): void
    {
        $user = User::factory()->create(['password' => Hash::make('OldPassword123!')]);
        $this->withHeaders(['Origin' => 'http://localhost:3000']);
        $this->withSession(['password_hash_web' => $user->password, 'auth_version' => 0]);
        $this->postJson('/reset-password', $this->payload($user, Password::createToken($user)))->assertOk();
        $this->postJson('/login', ['email' => $user->email, 'password' => 'NewPassword123!'])->assertOk();
        $this->getJson('/api/v1/me')->assertOk();
    }

    public function test_malformed_email_is_validated_before_any_notification_is_sent(): void
    {
        Notification::fake();
        $this->postJson('/forgot-password', ['email' => ['unexpected']])->assertUnprocessable()->assertJsonValidationErrors('email');
        Notification::assertNothingSent();
    }

    private function payload(User $user, string $token): array
    {
        return ['email' => $user->email, 'token' => $token, 'password' => 'NewPassword123!', 'password_confirmation' => 'NewPassword123!'];
    }
}
