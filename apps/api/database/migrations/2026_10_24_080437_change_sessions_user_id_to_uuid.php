
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        $column = DB::selectOne(<<<'SQL'
            SELECT data_type
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'sessions'
              AND column_name = 'user_id'
        SQL);

        if ($column?->data_type === 'uuid') {
            return;
        }

        if ($column?->data_type !== 'bigint') {
            throw new RuntimeException(
                'Unexpected sessions.user_id column type.'
            );
        }

        Schema::table('sessions', function (Blueprint $table) {
            $table->dropColumn('user_id');
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        // Intentionally irreversible: restoring BIGINT would
        // conflict with UUID-based user identifiers.
    }
};
