<?php

namespace Tests\Feature\Cards;

use App\Models\Card;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CardPolicyTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('cardAbilities')]
    public function test_only_the_owner_is_authorized_regardless_of_publication(string $ability, bool $published): void
    {
        $card = Card::factory()->create(['is_published' => $published]);
        $otherUser = User::factory()->create();

        $this->assertTrue(Gate::forUser($card->user)->allows($ability, $card));
        $denial = Gate::forUser($otherUser)->inspect($ability, $card);
        $this->assertTrue($denial->denied());
        $this->assertSame(404, $denial->status());
        $this->assertFalse(Gate::forUser(null)->allows($ability, $card));
    }

    public static function cardAbilities(): array
    {
        return [
            'view draft' => ['view', false], 'update draft' => ['update', false], 'delete draft' => ['delete', false],
            'view published' => ['view', true], 'update published' => ['update', true], 'delete published' => ['delete', true],
        ];
    }

    public function test_authenticated_users_can_list_and_create_cards(): void
    {
        $user = User::factory()->create();

        $this->assertTrue(Gate::forUser($user)->allows('viewAny', Card::class));
        $this->assertTrue(Gate::forUser($user)->allows('create', Card::class));
        $this->assertFalse(Gate::forUser(null)->allows('viewAny', Card::class));
        $this->assertFalse(Gate::forUser(null)->allows('create', Card::class));
    }
}
