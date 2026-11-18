import { afterEach, describe, expect, it, vi } from "vitest";
import { HeicConversionError, jpegFileName, readyForUpload, toJpegIfHeic } from "./media-client";

/**
 * SECURITY_REPORT 9.a, founder's answer (e): HEIC is converted to JPEG in the browser where it can
 * be decoded (Safari); where it cannot, the field sends the HEIC and the server converts it. The
 * browser APIs (createImageBitmap, canvas.toBlob, <img>) are stubbed: these tests run in Node.
 */

type Canvas = { width: number; height: number; getContext: () => unknown; toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => void };

function stubCanvas(opts: { blob?: Blob | null } = {}) {
  const drawn: Array<{ width: number; height: number }> = [];
  const canvases: Canvas[] = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      const canvas: Canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: (_s: unknown, _x: number, _y: number, width: number, height: number) => drawn.push({ width, height }) }),
        toBlob: (cb, type, quality) => {
          expect(type).toBe("image/jpeg");
          expect(quality).toBeGreaterThan(0.5);
          cb(opts.blob === undefined ? new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: "image/jpeg" }) : opts.blob);
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  return { drawn, canvases };
}

const heic = (name = "IMG_0001.HEIC", type = "image/heic") => new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])], name, { type, lastModified: 1 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toJpegIfHeic", () => {
  it("returns other files untouched (no decoding)", async () => {
    const createImageBitmap = vi.fn();
    vi.stubGlobal("createImageBitmap", createImageBitmap);
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" });
    expect(await toJpegIfHeic(jpeg)).toBe(jpeg);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("turns a HEIC the browser can decode into a .jpg JPEG File, upright and at most 2400 px", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async (_file: Blob, options: { imageOrientation?: string }) => {
      expect(options.imageOrientation).toBe("from-image");
      return { width: 4032, height: 3024, close };
    }));
    const { drawn, canvases } = stubCanvas();
    const out = await toJpegIfHeic(heic());
    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("IMG_0001.jpg");
    expect(canvases[0]).toMatchObject({ width: 2400, height: 1800 });
    expect(drawn).toEqual([{ width: 2400, height: 1800 }]);
    expect(close).toHaveBeenCalled();
  });

  it("falls back to an <img> when createImageBitmap cannot read HEIC (some Safari versions)", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("unsupported");
    }));
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: () => "blob:x", revokeObjectURL: revoke }));
    vi.stubGlobal("Image", class {
      src = "";
      naturalWidth = 1200;
      naturalHeight = 900;
      async decode() {}
    });
    stubCanvas();
    const out = await toJpegIfHeic(heic("photo.heif", "image/heif"));
    expect(out).toMatchObject({ name: "photo.jpg", type: "image/jpeg" });
    expect(revoke).toHaveBeenCalledWith("blob:x");
  });

  it("throws HeicConversionError where the browser cannot decode HEIC (Chrome on Windows)", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("The source image could not be decoded.");
    }));
    vi.stubGlobal("URL", Object.assign(Object.create(URL), { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    vi.stubGlobal("Image", class {
      src = "";
      naturalWidth = 0;
      naturalHeight = 0;
      async decode() {
        throw new Error("EncodingError");
      }
    });
    await expect(toJpegIfHeic(heic())).rejects.toBeInstanceOf(HeicConversionError);
  });

  it("never returns HEIC: a canvas that gives no JPEG is an error", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10, close: () => {} })));
    stubCanvas({ blob: new Blob([new Uint8Array([1])], { type: "image/png" }) });
    await expect(toJpegIfHeic(heic())).rejects.toBeInstanceOf(HeicConversionError);
  });

  it("names the converted file", () => {
    expect(jpegFileName("IMG_1.HEIC")).toBe("IMG_1.jpg");
    expect(jpegFileName("a.heif")).toBe("a.jpg");
    expect(jpegFileName(".heic")).toBe("photo.jpg");
  });
});

describe("readyForUpload", () => {
  it("sends the converted JPEG with a preview where the browser can decode HEIC", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 80, close: () => {} })));
    stubCanvas();
    const ready = await readyForUpload(heic());
    expect(ready.canPreview).toBe(true);
    expect(ready.file.type).toBe("image/jpeg");
  });

  it("sends the HEIC itself without a preview where it cannot (the server converts it)", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("no");
    }));
    vi.stubGlobal("Image", undefined);
    const original = heic();
    const ready = await readyForUpload(original);
    expect(ready).toEqual({ file: original, canPreview: false });
  });
});
