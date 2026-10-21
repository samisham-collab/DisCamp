// Taking or choosing a photo, and getting it ready to send: shrunk to at most
// 1280 pixels on its longest side and saved fresh as a JPEG, plus a small
// preview (480 pixels) for lists and photo strips, so they don't download
// the full photo. Saving fresh drops the location, camera and time details
// photos carry (EXIF), so a public photo never gives away more than the spot
// itself. Small files keep DisCamp inside Supabase's free storage and
// download allowances.

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { describeError, log } from './log';

export const MAX_PHOTO_EDGE = 1280;
/** JPEG quality: about 200 KB for a 1280-pixel photo. */
export const PHOTO_QUALITY = 0.7;
/** The preview's longest side, sharp in a photo strip on any phone. */
export const PREVIEW_EDGE = 480;
/** About 30 KB for a preview. */
export const PREVIEW_QUALITY = 0.6;

/** One saved JPEG. */
export interface PhotoFile {
  uri: string;
  width: number;
  height: number;
}

/** A photo ready to send, with its preview when one could be made. */
export interface PreparedPhoto extends PhotoFile {
  preview?: PhotoFile;
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

/** Shrinks a photo if it's large, saves it fresh as a JPEG, and makes its preview. */
export async function preparePhoto(uri: string): Promise<PreparedPhoto> {
  let image = await ImageManipulator.manipulate(uri).renderAsync();
  if (Math.max(image.width, image.height) > MAX_PHOTO_EDGE) {
    image = await ImageManipulator.manipulate(image)
      .resize(image.width >= image.height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE })
      .renderAsync();
  }
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });
  const photo: PreparedPhoto = { uri: saved.uri, width: saved.width, height: saved.height };
  try {
    let small = image;
    if (Math.max(image.width, image.height) > PREVIEW_EDGE) {
      small = await ImageManipulator.manipulate(image)
        .resize(image.width >= image.height ? { width: PREVIEW_EDGE } : { height: PREVIEW_EDGE })
        .renderAsync();
    }
    const preview = await small.saveAsync({ compress: PREVIEW_QUALITY, format: SaveFormat.JPEG });
    photo.preview = { uri: preview.uri, width: preview.width, height: preview.height };
  } catch (error) {
    // The full photo stands in where a preview would show.
    log.info('Could not make a photo preview', { error: describeError(error) });
  }
  return photo;
}

/** The photo's bytes, for uploading. */
export async function readPhotoBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}
