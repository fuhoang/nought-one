<?php

namespace App\Support;

final class CardAppearance
{
    public const TEMPLATES = ['minimal', 'centered', 'compact'];

    public const MODES = ['light', 'dark'];

    public const ACCENTS = ['neutral', 'slate', 'forest', 'navy'];

    /** @return array{mode: string, accent: string} */
    public static function publicTheme(mixed $settings): array
    {
        $settings = is_array($settings) ? $settings : [];

        return [
            'mode' => in_array($settings['mode'] ?? null, self::MODES, true) ? $settings['mode'] : 'light',
            'accent' => in_array($settings['accent'] ?? null, self::ACCENTS, true) ? $settings['accent'] : 'neutral',
        ];
    }
}
