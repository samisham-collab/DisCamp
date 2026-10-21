// Taking or choosing a photo, shrinking it and reading its bytes; and the
// check before a camper posts.

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { ReactNode } from 'react';
import { Alert, Platform } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { MAX_PHOTO_EDGE, pickPhoto, preparePhoto, readPhotoBytes } from '@/lib/photoPicker';
import { usePostingGate } from '@/lib/usePostingGate';

import { fakeBackend, NEWBIE, SAM, type FakeUser } from '../test/fakeSupabase';
import { imageSizes } from '../test/mocks/expoImageManipulator';

afterEach(() => {
  imageSizes.clear();
  jest.restoreAllMocks();
});

describe('pickPhoto', () => {
  it('takes a photo, shrinks it to 1280 pixels and saves it as a JPEG, with a 480-pixel preview', async () => {
    const result = await pickPhoto('camera');
    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1, exif: false });
    expect(result).toEqual({
      status: 'picked',
      photo: {
        uri: 'file:///cache/manipulated-1280x960.jpg',
        width: 1280,
        height: 960,
        preview: { uri: 'file:///cache/manipulated-480x360.jpg', width: 480, height: 360 },
      },
    });
  });

  it('chooses from the library without asking for the camera', async () => {
    imageSizes.set('file:///camera/photo.jpg', { width: 3000, height: 4000 });
    const result = await pickPhoto('library');
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'picked',
      photo: {
        uri: 'file:///cache/manipulated-960x1280.jpg',
        width: 960,
        height: 1280,
        preview: { uri: 'file:///cache/manipulated-360x480.jpg', width: 360, height: 480 },
      },
    });
  });

  it('says when the camera is off or the camper backs out', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, status: 'denied', canAskAgain: false } as never);
    expect(await pickPhoto('camera')).toEqual({ status: 'denied' });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();

    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickPhoto('library')).toEqual({ status: 'cancelled' });
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: false, assets: [] } as never);
    expect(await pickPhoto('library')).toEqual({ status: 'cancelled' });
  });
});

describe('preparePhoto', () => {
  it('leaves small photos their size', async () => {
    imageSizes.set('file:///small.jpg', { width: 800, height: 600 });
    expect(await preparePhoto('file:///small.jpg')).toEqual({
      uri: 'file:///cache/manipulated-800x600.jpg',
      width: 800,
      height: 600,
      preview: { uri: 'file:///cache/manipulated-480x360.jpg', width: 480, height: 360 },
    });
    // A tiny one is its own preview size.
    imageSizes.set('file:///tiny.jpg', { width: 400, height: 300 });
    expect((await preparePhoto('file:///tiny.jpg')).preview).toEqual({
      uri: 'file:///cache/manipulated-400x300.jpg',
      width: 400,
      height: 300,
    });
  });

  it('still sends the photo if its preview fails', async () => {
    const manipulate = jest.mocked(ImageManipulator.manipulate);
    const real = manipulate.getMockImplementation();
    if (!real) throw new Error('The stand-in has no implementation');
    // Opening and shrinking work; the preview's resize runs out of memory.
    manipulate
      .mockImplementationOnce(real)
      .mockImplementationOnce(real)
      .mockImplementationOnce(() => {
        throw new Error('Out of memory');
      });
    expect(await preparePhoto('file:///big.jpg')).toEqual({
      uri: 'file:///cache/manipulated-1280x960.jpg',
      width: 1280,
      height: 960,
    });
  });

  it('never makes a side longer than the limit', async () => {
    imageSizes.set('file:///tall.jpg', { width: 1000, height: 5000 });
    const photo = await preparePhoto('file:///tall.jpg');
    expect(Math.max(photo.width, photo.height)).toBe(MAX_PHOTO_EDGE);
  });
});

describe('readPhotoBytes', () => {
  it('reads the file on a phone', async () => {
    const bytes = await readPhotoBytes('file:///cache/photo.jpg');
    expect(bytes.byteLength).toBe(4);
  });

  it('fetches it on the web', async () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    const buffer = new Uint8Array([1, 2]).buffer;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ arrayBuffer: async () => buffer } as unknown as Response);
    try {
      expect(await readPhotoBytes('blob:photo')).toBe(buffer);
      expect(fetchSpy).toHaveBeenCalledWith('blob:photo');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });
});

describe('usePostingGate', () => {
  const gateFor = (client: ReturnType<typeof fakeBackend>['client'] | null) =>
    renderHook(() => ({ gate: usePostingGate(), auth: useAuth() }), {
      wrapper: ({ children }: { children: ReactNode }) => <AuthProvider client={client}>{children}</AuthProvider>,
    });

  /** The gate once the session (and, signed in, the camper's profile) has loaded. */
  const settled = async (user: FakeUser | null) => {
    const backend = fakeBackend();
    backend.auth.setUser(user);
    const hook = gateFor(backend.client);
    await waitFor(() => {
      expect(hook.result.current.auth.status).toBe(user ? 'signed-in' : 'signed-out');
      if (user) expect(hook.result.current.auth.termsAccepted).not.toBeNull();
    });
    return hook.result;
  };

  it('explains that posting needs the DisCamp server', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = gateFor(null);
    expect(result.current.gate('/spot/x')).toBe(false);
    expect(alert).toHaveBeenCalledWith(
      "This isn't available",
      'This version of DisCamp runs on its starter spots only.',
    );
  });

  it('waits while the session loads', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    const { result } = gateFor(fakeBackend().client);
    expect(result.current.auth.status).toBe('loading');
    expect(result.current.gate('/spot/x')).toBe(false);
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.auth.status).toBe('signed-out'));
  });

  it('sends campers to sign in, then to the rules, then lets them post', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    expect((await settled(null)).current.gate('/spot/x')).toBe(false);
    expect(push).toHaveBeenLastCalledWith({ pathname: '/sign-in', params: { next: '/spot/x' } });

    expect((await settled(NEWBIE)).current.gate('/spot/x')).toBe(false);
    expect(push).toHaveBeenLastCalledWith('/rules');

    push.mockClear();
    expect((await settled(SAM)).current.gate('/spot/x')).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});
