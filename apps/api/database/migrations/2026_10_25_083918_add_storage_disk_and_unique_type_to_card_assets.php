<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('card_assets', function (Blueprint $table) {
            $table->string('disk', 100)->default('local');
            $table->unique(['card_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::table('card_assets', function (Blueprint $table) {
            $table->dropUnique(['card_id', 'type']);
            $table->dropColumn('disk');
        });
    }
};
