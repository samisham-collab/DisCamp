// Taking or choosing a photo, and getting it ready to send: shrunk to at most
// 1600 pixels on its longest side and saved fresh as a JPEG. Saving it fresh
// drops the location, camera and time details photos carry (EXIF), so a
// public photo never gives away more than the spot itself.

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export const MAX_PHOTO_EDGE = 1600;
/** JPEG quality: about 300 KB for a 1600-pixel photo. */
export const PHOTO_QUALITY = 0.7;

/** A photo ready to send. */
export interface PreparedPhoto {
  uri: string;
  width: number;
  height: number;
}

export type PhotoSource = 'camera' | 'library';

export type PickResult = { status: 'picked'; photo: PreparedPhoto } | { status: 'cancelled' } | { status: 'denied' };

/** Asks for a photo from the camera or the photo library. */
export async function pickPhoto(source: PhotoSource): Promise<PickResult> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }
  // The library picker needs no permission: the camper picks, and only that
  // photo reaches the app.
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  return { status: 'picked', photo: await preparePhoto(asset.uri) };
}

/** Shrinks a photo if it's large, and saves it fresh as a JPEG. */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  let image = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(image.width, image.height) > MAX_PHOTO_EDGE) {
    image = await ImageManipulator.manipulate(image)
      .resize(image.width >= image.height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE })
      .renderAsync();
  }
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** The photo's bytes, for uploading. */
export async function readPhotoBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}
