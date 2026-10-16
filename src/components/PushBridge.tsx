// Keeps notifications working while the app runs: shows them when DisCamp is
// open, refreshes this phone's push address once a camper is signed in (if
// they already said yes; it never asks), and opens the right screen when a
// notification is tapped. Renders nothing.

import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/lib/auth';
import { notificationPath, notificationsModule, turnOnPush } from '@/lib/push';

/** Notification ids already opened, so one tap never opens a screen twice. */
const opened = new Set<string>();

function open(id: string, data: unknown) {
  if (opened.has(id)) return;
  opened.add(id);
  const path = notificationPath(data);
  if (path) router.push(path as never);
}

export function PushBridge() {
  const { client, status, user } = useAuth();
  const userId = user?.id ?? null;

  // Shown as a banner even while DisCamp is open, without a sound.
  useEffect(() => {
    const N = notificationsModule();
    if (!N) return undefined;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    // A tap that opened the app from closed, then taps while it runs. Each is
    // cleared once handled, so the next launch doesn't open it again.
    const handle = (response: ReturnType<typeof N.getLastNotificationResponse>) => {
      if (!response) return;
      open(response.notification.request.identifier, response.notification.request.content.data);
      N.clearLastNotificationResponse();
    };
    handle(N.getLastNotificationResponse());
    const subscription = N.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!client || status !== 'signed-in' || !userId) return;
    void turnOnPush(client, { ask: false });
  }, [client, status, userId]);

  return null;
}
