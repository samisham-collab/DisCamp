// Account: sign in, your Embers and rank, notifications, your display name,
// the spots you've added, campers you've blocked, the tip jar, help and
// legal links, sign out and delete your account (App Store rules require
// deletion inside the app). Moderators also get a way into Review.

import Ionicons from '@expo/vector-icons/Ionicons';
import type { SupabaseClient } from '@supabase/supabase-js';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmbersCard, ModeratorCard } from '@/components/EmbersCard';
import { TextField } from '@/components/form';
import { HelpCard, LinkRow } from '@/components/HelpCard';
import { NotificationsCard } from '@/components/NotificationsCard';
import { TipJar } from '@/components/TipJar';
import { Banner, Button, Card, EmptyState, Row, SectionTitle } from '@/components/ui';
import { APPLE_SIGN_IN_HELP_URL } from '@/config';
import { listBlocks, unblockCamper, type BlockedCamper } from '@/data/moderation';
import { useCleanups } from '@/data/cleanupsStore';
import { useSpots } from '@/data/spots';
import { revokeAppleSignIn } from '@/lib/appleRevoke';
import { useAuth } from '@/lib/auth';
import { appleRemovalSteps, providerLabel } from '@/lib/authProviders';
import { DEFAULT_DISPLAY_NAME, MAX_DISPLAY_NAME } from '@/lib/displayName';
import { openWebLink } from '@/lib/links';
import { formatDay } from '@/lib/time';
import { useOnce } from '@/lib/useOnce';
import { colors, radius, TOUCH_TARGET } from '@/theme';
import { KeyboardSafe } from '@/components/KeyboardSafe';

function AppleNote() {
  return (
    <Card>
      <SectionTitle>Your DisCamp account is deleted</SectionTitle>
      <Text style={styles.body}>{appleRemovalSteps()}</Text>
      <LinkRow label="Apple's instructions" url={APPLE_SIGN_IN_HELP_URL} />
    </Card>
  );
}

function BlockedCampers({ client }: { client: SupabaseClient | null }) {
  const { reload } = useSpots();
  const { refresh: refreshCleanups } = useCleanups();
  const [blocked, setBlocked] = useState<BlockedCamper[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Load each time Account comes into view: blocking happens on spot pages.
  useFocusEffect(
    useCallback(() => {
      if (!client) return undefined;
      let active = true;
      listBlocks(client).then(
        (list) => {
          if (!active) return;
          setBlocked(list);
          setError(null);
        },
        (e: unknown) => {
          if (active) setError(e instanceof Error ? e.message : "Couldn't load the campers you've blocked.");
        },
      );
      return () => {
        active = false;
      };
    }, [client]),
  );

  const unblock = async (camper: BlockedCamper) => {
    if (!client) return;
    setBusy(camper.id);
    try {
      await unblockCamper(client, camper.id);
      setBlocked((list) => (list ?? []).filter((c) => c.id !== camper.id));
      void reload();
      void refreshCleanups();
      AccessibilityInfo.announceForAccessibility(`${camper.name ?? 'Camper'} unblocked`);
    } catch (e) {
      Alert.alert("Couldn't unblock", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <SectionTitle>Blocked campers</SectionTitle>
      {error ? <Banner tone="error" message={error} /> : null}
      {blocked == null && !error ? <ActivityIndicator color={colors.pine} accessibilityLabel="Loading" /> : null}
      {blocked != null && blocked.length === 0 ? (
        <Text style={styles.body}>
          Nobody. To stop seeing a camper&apos;s spots, open one of them and tap Block at the bottom.
        </Text>
      ) : null}
      {(blocked ?? []).map((camper) => (
        <View key={camper.id} style={styles.blockRow}>
          <Text style={styles.blockName} numberOfLines={1}>
            {camper.name ?? 'A camper'}
          </Text>
          <Pressable
            onPress={() => void unblock(camper)}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${camper.name ?? 'this camper'}`}
            accessibilityState={{ busy: busy === camper.id, disabled: busy !== null }}
            style={({ pressed }) => [styles.unblock, pressed && styles.pressed]}
          >
            {busy === camper.id ? (
              <ActivityIndicator color={colors.pine} />
            ) : (
              <Text style={styles.unblockText}>Unblock</Text>
            )}
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

export default function AccountScreen() {
  const auth = useAuth();
  const { spots, refresh } = useSpots();
  // What the camper is typing; null until they start.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const once = useOnce();
  const [busy, setBusy] = useState<'sign-out' | 'delete' | null>(null);
  // Set after deleting an account that used Sign in with Apple; cleared when
  // anyone signs in again.
  const [appleNote, setAppleNote] = useState(false);
  if (appleNote && auth.status === 'signed-in') setAppleNote(false);

  const userId = auth.user?.id;
  // A name typed but not saved belongs to whoever typed it, not the next camper.
  const [nameOwner, setNameOwner] = useState(userId);
  if (nameOwner !== userId) {
    setNameOwner(userId);
    setNameDraft(null);
    setNameError(null);
  }
  const mine = useMemo(
    () =>
      spots
        .filter((s) => userId != null && s.createdBy === userId)
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    [spots, userId],
  );

  if (auth.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.pine} accessibilityLabel="Checking your sign-in" />
      </View>
    );
  }

  if (auth.status === 'disabled') {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Accounts aren't available"
          message="This version of DisCamp runs on its starter spots only, so signing in and adding spots are turned off. Browsing works as usual."
        />
        <TipJar />
        <HelpCard />
      </ScrollView>
    );
  }

  if (auth.status === 'signed-out' || !auth.user) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        {appleNote ? <AppleNote /> : null}
        <View style={styles.intro}>
          <Ionicons
            accessibilityElementsHidden
            importantForAccessibility="no"
            name="person-circle-outline"
            size={64}
            color={colors.pine}
          />
          <Text style={styles.title} accessibilityRole="header">
            Add the spots you know
          </Text>
          <Text style={styles.body}>
            Sign in to add spots, photos and cleanups, and to fix what you&apos;ve added. Browsing never needs an
            account.
          </Text>
        </View>
        <Button label="Sign in" icon="log-in-outline" onPress={() => router.push('/sign-in')} />
        <TipJar />
        <HelpCard />
      </ScrollView>
    );
  }

  const name = auth.displayName ?? DEFAULT_DISPLAY_NAME;
  const typed = nameDraft ?? name;
  const nameChanged = nameDraft != null && nameDraft.trim() !== name;

  const saveName = async () => {
    setSavingName(true);
    const result = await auth.rename(typed);
    setSavingName(false);
    if (result.ok) {
      setNameDraft(null);
      setNameError(null);
      AccessibilityInfo.announceForAccessibility('Name saved');
    } else {
      setNameError(result.message);
    }
  };

  const signOut = async () => {
    setBusy('sign-out');
    const result = await auth.signOut();
    setBusy(null);
    if (!result.ok) Alert.alert("Couldn't sign out", result.message);
  };

  /**
   * Deletes the account. For Sign in with Apple, Apple's sheet first
   * confirms it's them so DisCamp can disconnect their Apple ID; if that
   * can't happen, the account is still deleted and the app explains the
   * manual step. `skipApple`: the camper chose to delete without Apple.
   */
  const removeAccount = async (skipApple = false) => {
    const apple = auth.user?.apple === true;
    setBusy('delete');
    let disconnected = false;
    if (apple && !skipApple && auth.client) {
      const check = await revokeAppleSignIn(auth.client);
      if (check === 'cancelled') {
        setBusy(null);
        Alert.alert('Your account is still here', 'You closed the Apple check, so nothing was deleted.', [
          { text: 'Keep my account', style: 'cancel' },
          { text: 'Delete without Apple', style: 'destructive', onPress: () => void removeAccount(true) },
        ]);
        return;
      }
      disconnected = check === 'revoked';
    }
    const result = await auth.deleteAccount();
    setBusy(null);
    if (!result.ok) {
      Alert.alert("Couldn't delete your account", result.message);
      return;
    }
    // Spots you added now show without your name.
    void refresh();
    if (apple && !disconnected) {
      setAppleNote(true);
      Alert.alert('Account deleted', appleRemovalSteps(), [
        { text: "Apple's instructions", onPress: () => void openWebLink(APPLE_SIGN_IN_HELP_URL) },
        { text: 'OK' },
      ]);
    } else {
      Alert.alert(
        'Account deleted',
        disconnected
          ? 'DisCamp is disconnected from your Apple ID too. Thanks for helping other campers.'
          : 'Thanks for helping other campers.',
      );
    }
  };

  const deleteAccount = () => {
    const appleSheet = auth.user?.apple === true && Platform.OS === 'ios';
    Alert.alert(
      'Delete your account?',
      'This removes your sign-in and your display name. Spots you added stay on the map without your name. This can’t be undone.' +
        (appleSheet ? ' Apple will ask you to confirm, so DisCamp can disconnect your Apple ID.' : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void removeAccount() },
      ],
    );
  };

  return (
    <KeyboardSafe>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
      >
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Signed in as</Text>
          <Text style={styles.summaryName}>{name}</Text>
          <Text style={styles.summaryDetail}>with {providerLabel(auth.user.provider)}</Text>
        </View>

        {auth.client ? <EmbersCard key={auth.user.id} client={auth.client} /> : null}
        {auth.client ? <ModeratorCard key={`mod-${auth.user.id}`} client={auth.client} /> : null}
        {auth.client ? <NotificationsCard client={auth.client} /> : null}

        <Card>
          <SectionTitle>Your name on DisCamp</SectionTitle>
          <TextField
            label="Display name"
            value={typed}
            onChangeText={(text) => {
              setNameDraft(text);
              setNameError(null);
            }}
            hint="Shows on spots, photos and cleanups you post."
            error={nameError}
            maxLength={MAX_DISPLAY_NAME + 10}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (nameChanged) void saveName();
            }}
          />
          <Button
            label="Save name"
            kind="secondary"
            disabled={!nameChanged}
            loading={savingName}
            onPress={() => once(saveName)}
          />
        </Card>

        <Card>
          <SectionTitle>Spots you added</SectionTitle>
          {mine.length === 0 ? (
            <Text style={styles.body}>None yet. Know a good spot? Share it with other campers.</Text>
          ) : (
            mine.map((spot) => (
              <Pressable
                key={spot.id}
                onPress={() => router.push({ pathname: '/spot/[id]', params: { id: spot.id } })}
                accessibilityRole="button"
                accessibilityHint="Opens the spot"
                style={({ pressed }) => [styles.spotRow, pressed && styles.pressed]}
              >
                <View style={styles.spotText}>
                  <Text style={styles.spotName} numberOfLines={1}>
                    {spot.name}
                  </Text>
                  {spot.createdAt ? <Text style={styles.spotMeta}>Added {formatDay(spot.createdAt)}</Text> : null}
                </View>
                <Ionicons
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
            ))
          )}
          <Button label="Add a spot" icon="add" onPress={() => router.push('/spot/new')} />
        </Card>

        <BlockedCampers client={auth.client} />

        <TipJar />

        <HelpCard />

        <Card>
          <SectionTitle>Account</SectionTitle>
          <Row label="Signed in with" value={providerLabel(auth.user.provider)} />
          <Row label="Email (only you see this)" value={auth.user.email ?? 'Not shared'} />
          <Button
            label="Sign out"
            icon="log-out-outline"
            kind="secondary"
            loading={busy === 'sign-out'}
            disabled={busy !== null}
            onPress={() => void signOut()}
          />
          <Pressable
            onPress={deleteAccount}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityState={{ busy: busy === 'delete', disabled: busy !== null }}
            style={styles.deleteButton}
          >
            {busy === 'delete' ? (
              <ActivityIndicator color={colors.red} />
            ) : (
              <Text style={styles.deleteText}>Delete account</Text>
            )}
          </Pressable>
        </Card>
      </ScrollView>
    </KeyboardSafe>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: colors.bg },
  intro: { alignItems: 'center', gap: 8, paddingTop: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 15, color: colors.body, lineHeight: 21 },
  summary: { padding: 16, borderRadius: radius.lg, backgroundColor: colors.pine, gap: 2 },
  summaryLabel: { fontSize: 13, color: '#D7E8DE' },
  summaryName: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  summaryDetail: { fontSize: 15, color: '#FFFFFF' },
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TOUCH_TARGET,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  spotText: { flex: 1 },
  spotName: { fontSize: 16, fontWeight: '700', color: colors.ink },
  spotMeta: { fontSize: 13, color: colors.muted },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TOUCH_TARGET,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  blockName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.ink },
  unblock: { minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  unblockText: { fontSize: 15, fontWeight: '700', color: colors.pine, textDecorationLine: 'underline' },
  deleteButton: { minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 15, fontWeight: '700', color: colors.red, textDecorationLine: 'underline' },
  pressed: { opacity: 0.75 },
});
