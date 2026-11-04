<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Throwable;

class PasswordResetController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email', 'max:255']]);

        try {
            Password::sendResetLink($validated);
        } catch (Throwable $exception) {
            // Keep delivery failures indistinguishable from an unknown address.
            report($exception);
        }

        return response()->json([
            'message' => 'If an account matches that email, a reset link will arrive shortly. You can request another link after a minute.',
        ])->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)->letters()->mixedCase()->numbers()],
        ]);

        // Lock the token row so concurrent submissions cannot reuse a valid token.
        $status = DB::transaction(function () use ($validated) {
            DB::table(config('auth.passwords.users.table'))->where('email', $validated['email'])->lockForUpdate()->first();

            return Password::reset($validated, function (User $user, string $password): void {
                $user->forceFill(['password' => Hash::make($password), 'remember_token' => Str::random(60)])->save();
                $user->increment('auth_version');
                event(new PasswordReset($user));
            });
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['token' => ['This reset link is invalid or has expired. Request a new link.']]);
        }

        return response()->json(['message' => 'Password reset. Sign in with your new password.'])
            ->header('Cache-Control', 'private, no-store');
    }
}
