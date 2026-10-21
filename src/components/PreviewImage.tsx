// A photo in a list or strip: its small preview, or the full photo if the
// preview isn't there (photos from before previews, or one that didn't
// upload). Previews keep DisCamp inside Supabase's free download allowance.

import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';

export function PreviewImage({
  previewUrl,
  url,
  ...props
}: Omit<ImageProps, 'source' | 'onError'> & { previewUrl?: string; url: string }) {
  // The preview that failed, so a new photo in the same place tries its own.
  const [failed, setFailed] = useState<string | null>(null);
  const uri = previewUrl && failed !== previewUrl ? previewUrl : url;
  return (
    <Image
      {...props}
      source={{ uri }}
      cachePolicy="disk"
      onError={() => {
        if (uri === previewUrl) setFailed(previewUrl);
      }}
    />
  );
}
