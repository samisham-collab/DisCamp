// The community rules on their own, for campers who haven't agreed yet and
// want to post a photo or check in. Goes back once they agree.

import { router } from 'expo-router';
import { useEffect } from 'react';

import { AccountGate } from '@/components/AccountGate';
import { TermsGate } from '@/components/TermsGate';
import { useAuth } from '@/lib/auth';

export default function RulesScreen() {
  const { status, termsAccepted } = useAuth();
  useEffect(() => {
    if (status === 'signed-in' && termsAccepted === true) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [status, termsAccepted]);
  if (status !== 'signed-in') return <AccountGate status={status} next="/account" action="Posting" />;
  return <TermsGate />;
}
