// Every screen, checked the way VoiceOver and TalkBack see it: anything a
// camper can tap says what it is (a role) and what it does (a name), and
// labelled photos can be reached. Catches a new icon-only button or a
// spinner that hides a button's label.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from 'expo-router/testing-library';
import type { ReactTestInstance } from 'react-test-renderer';

import { ALEX, fakeBackend, SAM } from '../../test/fakeSupabase';
import { makeRow } from '../../test/fixtures';
import { connectServer, resetServer } from '../../test/helpers';
import { renderApp } from '../../test/renderApp';

jest.mock('@/data/seedSpots', () => jest.requireActual('../../test/mocks/seedSpots'));

/** Roles a screen reader announces as something to activate. */
const TAPPABLE_ROLES = new Set([
  'button',
  'link',
  'imagebutton',
  'tab',
  'checkbox',
  'radio',
  'switch',
  'togglebutton',
  'adjustable',
  'menuitem',
  'combobox',
  'search',
]);

function textOf(node: ReactTestInstance | string): string {
  if (typeof node === 'string') return node;
  if (node.props.accessibilityElementsHidden || node.props.importantForAccessibility === 'no-hide-descendants') {
    return '';
  }
  return node.children.map(textOf).join('');
}

/** What a screen reader reads for the element: its label, or the text inside it. */
function nameOf(node: ReactTestInstance): string {
  const label: unknown = node.props.accessibilityLabel ?? node.props['aria-label'];
  if (typeof label === 'string' && label.trim()) return label.trim();
  return textOf(node).trim();
}

/**
 * Map pins are native map annotations (the test map draws them as plain
 * views); their labels are checked in the map tests.
 */
const MAP_PIN = /^(marker-|route-destination$|cleanup-marker-)/;

/** Host elements a camper can tap: they handle a press. */
function tappables(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      (typeof n.props.onClick === 'function' || typeof n.props.onResponderRelease === 'function') &&
      n.props.accessible !== false &&
      !MAP_PIN.test(String(n.props.testID ?? '')),
  );
}

function describeNode(node: ReactTestInstance): string {
  return `${String(node.type)} ${JSON.stringify({
    role: node.props.accessibilityRole,
    label: node.props.accessibilityLabel,
    testID: node.props.testID,
    text: textOf(node).slice(0, 40),
  })}`;
}

function problems(): string[] {
  const root = screen.UNSAFE_root;
  const found: string[] = [];
  for (const node of tappables(root)) {
    const role: unknown = node.props.accessibilityRole ?? node.props.role;
    if (typeof role !== 'string' || !TAPPABLE_ROLES.has(role)) found.push(`no tappable role: ${describeNode(node)}`);
    if (!nameOf(node)) found.push(`no name: ${describeNode(node)}`);
  }
  // A photo with a label must be reachable, or the label is never read.
  for (const node of root.findAll(
    (n) => typeof n.type === 'string' && (String(n.type) === 'Image' || n.props.source != null),
  )) {
    if (node.props.accessibilityLabel && node.props.accessible !== true && !hasTappableAncestor(node)) {
      found.push(`labelled photo not reachable: ${describeNode(node)}`);
    }
  }
  return found;
}

function hasTappableAncestor(node: ReactTestInstance): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (typeof p.type === 'string' && (p.props.onClick || p.props.onResponderRelease)) return true;
  }
  return false;
}

const SAMS_SPOT = makeRow({ id: 'sams-spot', name: 'Sam Flat', created_by: SAM.id, added_by: 'Sam' });
const ALEX_SPOT = makeRow({ id: 'alex-spot', name: 'Alex Flat', created_by: ALEX.id, added_by: 'Alex' });

describe('Accessibility', () => {
  afterEach(() => {
    resetServer();
    jest.restoreAllMocks();
  });

  describe('without a server (starter spots)', () => {
    it.each(['/', '/rig', '/account', '/cleanups', '/spot/smoky-gardens', '/route/smoky-gardens'])(
      '%s: every control has a role and a name',
      async (url) => {
        await renderApp(url);
        expect(problems()).toEqual([]);
      },
    );

    it('the list view too', async () => {
      await renderApp('/', { prefs: { view: 'list' } });
      expect(problems()).toEqual([]);
    });
  });

  describe('signed in', () => {
    function signedIn() {
      const backend = fakeBackend([SAMS_SPOT, ALEX_SPOT]);
      backend.auth.setUser(ALEX);
      backend.auth.setUser(SAM);
      connectServer(backend);
      return backend;
    }

    it.each([
      '/account',
      '/spot/sams-spot',
      '/spot/alex-spot',
      '/spot/new',
      '/spot/edit/sams-spot',
      '/checkin/alex-spot',
      '/report/spot/alex-spot',
      '/cleanups',
      '/cleanup/new',
      '/rules',
    ])('%s: every control has a role and a name', async (url) => {
      signedIn();
      await renderApp(url);
      // Let what loads after the first frame (photos, check-ins) arrive.
      await screen.findAllByText(/./);
      expect(problems()).toEqual([]);
    });

    it('a photo just taken can be reached', async () => {
      signedIn();
      await renderApp('/cleanup/new');
      fireEvent.press(await screen.findByText('Take the before photo'));
      expect(await screen.findByLabelText('Your before photo')).toBeTruthy();
      expect(problems()).toEqual([]);
    });

    it('/sign-in, signed out', async () => {
      connectServer(fakeBackend());
      await renderApp('/sign-in');
      await screen.findByText('Sign in to DisCamp');
      expect(problems()).toEqual([]);
    });
  });
});
