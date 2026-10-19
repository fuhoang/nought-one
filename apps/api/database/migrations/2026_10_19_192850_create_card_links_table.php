
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_links', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('card_id')
                ->constrained('cards')
                ->cascadeOnDelete();

            $table->string('type', 50);
            $table->string('label', 100);
            $table->string('url', 2048);
            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_visible')->default(true);

            $table->timestamps();

            $table->index(['card_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_links');
    }
};
