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