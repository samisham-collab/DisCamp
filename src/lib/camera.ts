// Taking a photo with the camera for a cleanup: camera only (never the photo
// library, so an old photo can't be reused), shrunk and saved fresh like
// every DisCamp photo. Explains what went wrong instead of failing quietly.

import { Alert, Linking } from 'react-native';

import { describeError, log } from './log';
import { pickPhoto, type PreparedPhoto } from './photoPicker';

/** A new photo from the camera, or null if the camper cancelled (or it failed, after saying so). */
export async function takeCameraPhoto(purpose: string): Promise<PreparedPhoto | null> {
  let picked;
  try {
    picked = await pickPhoto('camera');
  } catch (error) {
    log.warn('Could not take a photo', { error: describeError(error) });
    Alert.alert("Couldn't take the photo", 'Try again.');
    return null;
  }
  if (picked.status === 'cancelled') return null;
  if (picked.status === 'denied') {
    Alert.alert('Camera is off for DisCamp', `Allow the camera in Settings to ${purpose}.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ]);
    return null;
  }
  return picked.photo;
}
