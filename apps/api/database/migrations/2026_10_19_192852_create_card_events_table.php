
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_events', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('card_id')
                ->constrained('cards')
                ->cascadeOnDelete();

            $table->string('event_type', 50);
            $table->string('source', 50)->nullable();

            $table->timestamps();

            $table->index(['card_id', 'event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_events');
    }
};
