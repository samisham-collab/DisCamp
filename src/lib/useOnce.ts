// One send at a time. A busy flag in state turns a button off only after the
// screen updates, so a quick double tap can land twice before that; this
// ignores a second press while the first is still going.

import { useCallback, useRef } from 'react';

import { log } from './log';

export function useOnce(): (task: () => Promise<unknown>) => void {
  const running = useRef(false);
  return useCallback((task: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    task()
      .catch((error: unknown) => log.error('An action failed unexpectedly', error))
      .finally(() => {
        running.current = false;
      });
  }, []);
}
