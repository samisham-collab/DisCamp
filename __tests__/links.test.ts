import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as Clipboard from 'expo-clipboard';
import { Alert, Linking, Share } from 'react-native';

import { SEED_SPOTS } from '@/data/seedSpots';
import {
  callPhone,
  copyCoordinates,
  copyText,
  directionsUrl,
  emailUrl,
  mapsSearchUrl,
  openDirections,
  openEmail,
  openWebLink,
  phoneDigits,
  shareMessage,
  shareSpot,
} from '@/lib/links';

const smoky = SEED_SPOTS.find((s) => s.id === 'smoky-gardens');
if (!smoky) throw new Error('No Smoky Gardens starter spot');

describe('links', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('builds directions for each platform', () => {
    const at = { latitude: 39.19, longitude: -101.76 };
    expect(directionsUrl(at, 'Smoky Gardens', 'ios')).toBe(
      'https://maps.apple.com/?daddr=39.19,-101.76&q=Smoky%20Gardens',
    );
    expect(directionsUrl(at, 'Smoky Gardens', 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=39.19,-101.76',
    );
    expect(mapsSearchUrl(at)).toBe('https://www.google.com/maps/search/?api=1&query=39.19,-101.76');
  });

  it('cleans phone numbers', () => {
    expect(phoneDigits('(785) 899-6334')).toBe('7858996334');
    expect(phoneDigits(' +1 785.899.6334 ')).toBe('+17858996334');
  });

  it('writes a share message with name, coordinates and a map link', () => {
    expect(shareMessage(smoky)).toBe(
      [
        'Smoky Gardens on DisCamp',
        'Campground · Sherman County · Soldiers Memorial Park',
        '39.19000, -101.76000',
        'https://www.google.com/maps/search/?api=1&query=39.19,-101.76',
      ].join('\n'),
    );
  });

  it('opens directions and calls', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await expect(openDirections(smoky)).resolves.toBe(true);
    await expect(callPhone('(785) 899-6334')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith(expect.stringContaining('39.19,-101.76'));
    expect(open).toHaveBeenCalledWith('tel:7858996334');
  });

  it('tells the camper when a link cannot open', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await expect(openDirections(smoky)).resolves.toBe(false);
    expect(alert).toHaveBeenCalledWith("Couldn't open Maps", expect.stringContaining('39.19000, -101.76000'));
  });

  it('refuses non-web links', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await expect(openWebLink('javascript:alert(1)')).resolves.toBe(false);
    await expect(openWebLink('https://example.org')).resolves.toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('shares and copies, reporting failures', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await shareSpot(smoky);
    expect(share).toHaveBeenCalledWith({ title: 'Smoky Gardens', message: shareMessage(smoky) });

    await expect(copyCoordinates(smoky)).resolves.toBe(true);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('39.19000, -101.76000');

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    share.mockRejectedValueOnce(new Error('cancelled badly'));
    await shareSpot(smoky);
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    await expect(copyCoordinates(smoky)).resolves.toBe(false);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('writes emails and copies text, reporting failures', async () => {
    expect(emailUrl('help@discamp.app')).toBe('mailto:help@discamp.app');
    expect(emailUrl('help@discamp.app', 'Spot & name')).toBe('mailto:help@discamp.app?subject=Spot%20%26%20name');
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await expect(openEmail('help@discamp.app', 'DisCamp')).resolves.toBe(true);
    expect(open).toHaveBeenCalledWith('mailto:help@discamp.app?subject=DisCamp');

    await expect(copyText('help@discamp.app', 'email address')).resolves.toBe(true);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('help@discamp.app');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    await expect(copyText('help@discamp.app', 'email address')).resolves.toBe(false);
    expect(alert).toHaveBeenCalledWith("Couldn't copy", 'The email address is help@discamp.app.');
  });
});
