// Test stand-in for expo-image-manipulator: tracks sizes the way the real one
// does, and "saves" to a predictable file.

import { jest } from '@jest/globals';

export const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } as const;

/** Sizes of the photos the stand-in "opens", by uri. Unknown ones are 4032 x 3024. */
export const imageSizes = new Map<string, { width: number; height: number }>();

class FakeImage {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  saveAsync = jest.fn(async (_options?: unknown) => ({
    uri: `file:///cache/manipulated-${this.width}x${this.height}.jpg`,
    width: this.width,
    height: this.height,
  }));
}

class FakeContext {
  constructor(private size: { width: number; height: number }) {}
  resize({ width, height }: { width?: number | null; height?: number | null }) {
    const ratio = width ? width / this.size.width : (height ?? this.size.height) / this.size.height;
    this.size = { width: Math.round(this.size.width * ratio), height: Math.round(this.size.height * ratio) };
    return this;
  }
  renderAsync = async () => new FakeImage(this.size.width, this.size.height);
}

export const ImageManipulator = {
  manipulate: jest.fn((source: string | FakeImage) =>
    typeof source === 'string'
      ? new FakeContext(imageSizes.get(source) ?? { width: 4032, height: 3024 })
      : new FakeContext({ width: source.width, height: source.height }),
  ),
};
