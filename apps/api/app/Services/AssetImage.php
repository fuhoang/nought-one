<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class AssetImage
{
    /** @return array{contents: string, mime_type: string, extension: string} */
    public function normalize(UploadedFile $file): array
    {
        $image = @imagecreatefromstring($file->getContent());
        if ($image === false) {
            throw ValidationException::withMessages(['file' => 'The file must contain a decodable image.']);
        }

        $mime = $file->getMimeType();
        imagesavealpha($image, true);
        ob_start();
        try {
            $success = match ($mime) {
                'image/jpeg' => imagejpeg($image, null, 90),
                'image/png' => imagepng($image, null, 6),
                'image/webp' => imagewebp($image, null, 90),
                default => false,
            };
            $contents = ob_get_contents();
        } finally {
            ob_end_clean();
        }

        if (! $success || ! is_string($contents) || $contents === '') {
            throw new RuntimeException('Image encoding failed.');
        }
        if (strlen($contents) > 2 * 1024 * 1024) {
            throw ValidationException::withMessages(['file' => 'The processed image must not exceed 2 MB.']);
        }

        return [
            'contents' => $contents,
            'mime_type' => $mime,
            'extension' => match ($mime) {
                'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'
            },
        ];
    }
}
