// Says so on a posting screen when new photos or posts are paused (DisCamp
// is near a limit of Supabase's free plan, or a moderator paused them). The
// database refuses them anyway; this saves a camper the try.

import { Banner } from '@/components/ui';
import { PHOTOS_PAUSED_MESSAGE, POSTING_PAUSED_MESSAGE, useAppStatus } from '@/data/appStatus';
import { useAuth } from '@/lib/auth';

export function PausedNotice({ what }: { what: 'photos' | 'posting' }) {
  const { client } = useAuth();
  const status = useAppStatus(client);
  if (status.postingPaused) {
    return <Banner tone="warning" message={POSTING_PAUSED_MESSAGE} announceKey="posting-paused" />;
  }
  if (what === 'photos' && status.photosPaused) {
    return <Banner tone="warning" message={PHOTOS_PAUSED_MESSAGE} announceKey="photos-paused" />;
  }
  return null;
}
