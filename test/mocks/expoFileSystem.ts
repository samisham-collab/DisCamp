// Test stand-in for expo-file-system's File: every photo is a few bytes.

export class File {
  constructor(readonly uri: string) {}
  async arrayBuffer(): Promise<ArrayBuffer> {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
  }
}
