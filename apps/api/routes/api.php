<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Route::get('/user', function (Request $request) {
//     return $request->user();
// })->middleware('auth:sanctum');

Route::get('/v1/health', function () {
    return response()->json([
        'status' => 'ok',
        'service' => 'nought-one-api',
    ]);
});


Route::prefix('v1')->group(function () {
    Route::middleware('auth:sanctum')->get('/me', function (Request $request) {
        return response()->json([
            'user' => $request->user()->only(
                'id',
                'name',
                'email',
                'email_verified_at'
            ),
        ]);
    });
});
