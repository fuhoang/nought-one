<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class EmailVerificationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        if ($request->user()->hasVerifiedEmail()) {
            return response()->json(['message' => 'Your email is already verified.'])->header('Cache-Control', 'private, no-store');
        }

        try {
            $request->user()->sendEmailVerificationNotification();
        } catch (Throwable $exception) {
            report($exception);

            return response()->json(['message' => 'We could not send the verification email. Please try again shortly.'], 503)
                ->header('Cache-Control', 'private, no-store');
        }

        return response()->json(['message' => 'Verification email sent. Check your inbox.'])
            ->header('Cache-Control', 'private, no-store');
    }

    public function show(EmailVerificationRequest $request): JsonResponse
    {
        $request->fulfill();

        return response()->json(['message' => 'Your email is verified.'])
            ->header('Cache-Control', 'private, no-store');
    }
}
