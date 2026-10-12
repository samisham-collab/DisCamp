// Leaving the app: directions, phone calls, sharing, copying coordinates and
// web links. Every action reports failure to the camper instead of failing
// silently.

import * as Clipboard from 'expo-clipboard';
import { Alert, Linking, Platform, Share } from 'react-native';

import type { Coordinates, Spot } from '../types';
import { formatCoordinates } from './geo';
import { log } from './log';

export function directionsUrl(to: Coordinates, name: string, os: string = Platform.OS): string {
  const point = `${to.latitude},${to.longitude}`;
  if (os === 'ios') return `https://maps.apple.com/?daddr=${point}&q=${encodeURIComponent(name)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${point}`;
}

/** A link that opens the spot in any maps app or browser. */
export function mapsSearchUrl(at: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${at.latitude},${at.longitude}`;
}

/** Keeps a leading + and the digits: "(785) 899-6334" becomes "7858996334". */
export function phoneDigits(phone: string): string {
  const trimmed = phone.trim();
  return (trimmed.startsWith('+') ? '+' : '') + trimmed.replace(/\D/g, '');
}

export function shareMessage(spot: Spot): string {
  return [
    `${spot.name} on DisCamp`,
    `${spot.siteType === 'campground' ? 'Campground' : 'Dispersed camping'} · ${spot.landManager}`,
    formatCoordinates(spot),
    mapsSearchUrl(spot),
  ].join('\n');
}

async function open(url: string, failTitle: string, failMessage: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch (error) {
    log.warn('Could not open link', { url, error: String(error) });
    Alert.alert(failTitle, failMessage);
    return false;
  }
}

export function openDirections(spot: Spot): Promise<boolean> {
  return open(
    directionsUrl(spot, spot.name),
    "Couldn't open Maps",
    `Enter these coordinates in your maps app: ${formatCoordinates(spot)}`,
  );
}

export function callPhone(phone: string): Promise<boolean> {
  return open(`tel:${phoneDigits(phone)}`, "Couldn't start a call", `The number is ${phone}.`);
}

export function openWebLink(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return Promise.resolve(false);
  return open(url, "Couldn't open the link", url);
}

export async function shareSpot(spot: Spot): Promise<void> {
  try {
    await Share.share({ title: spot.name, message: shareMessage(spot) });
  } catch (error) {
    log.warn('Share failed', { error: String(error) });
    Alert.alert("Couldn't share this spot", 'Try copying the coordinates instead.');
  }
}

export async function copyCoordinates(spot: Spot): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(formatCoordinates(spot));
    return true;
  } catch (error) {
    log.warn('Copy failed', { error: String(error) });
    Alert.alert("Couldn't copy", `The coordinates are ${formatCoordinates(spot)}.`);
    return false;
  }
}

/** Opens the mail app to write to `address`. */
export function emailUrl(address: string, subject?: string): string {
  return `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
}

export function openEmail(address: string, subject?: string): Promise<boolean> {
  return open(emailUrl(address, subject), "Couldn't open your mail app", `Write to ${address}.`);
}

export async function copyText(text: string, what: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch (error) {
    log.warn('Copy failed', { error: String(error) });
    Alert.alert("Couldn't copy", `The ${what} is ${text}.`);
    return false;
  }
}
