/** Types for heic-decode 2.1.0 (it ships none). Used only by src/lib/images.ts (HEIC uploads). */
declare module "heic-decode" {
  type DecodedImage = { width: number; height: number; data: Uint8ClampedArray };
  type HeicImage = { width: number; height: number; decode: () => Promise<DecodedImage> };
  type Decode = {
    (input: { buffer: Uint8Array | ArrayBuffer }): Promise<DecodedImage>;
    /** Every top-level image, with its size read before decoding; call dispose() when done. */
    all: (input: { buffer: Uint8Array | ArrayBuffer }) => Promise<HeicImage[] & { dispose: () => void }>;
  };
  const decode: Decode;
  export default decode;
}
