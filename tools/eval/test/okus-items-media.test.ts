import { describe, expect, it } from "vitest";
import { photoForImage } from "../src/okus-items.ts";

/** A spec image takes the fixture photo it names, not the photo at its position in the spec's list. No model call. */
const photos = [{ file: "photos/01.jpg" }, { file: "photos/02.jpg" }, { file: "photos/03.jpg" }];

describe("specMedia binds a spec image to a fixture photo", () => {
  it("by the file the spec names, whatever the image's position", () => {
    // The spec lists its second photo first: position 0, but it is photos/02.jpg.
    expect(photoForImage(photos, { id: "img_a", src: "uploads/02.jpg" }, 0)).toBe(photos[1]);
    expect(photoForImage(photos, { id: "img_b", src: "uploads/03.jpg" }, 1)).toBe(photos[2]);
  });

  it("by the number in the image id when the file name matches no photo", () => {
    expect(photoForImage(photos, { id: "img_03", src: "uploads/hero.webp" }, 0)).toBe(photos[2]);
  });

  it("by position when neither names a photo", () => {
    expect(photoForImage(photos, { id: "img_hero", src: "uploads/hero.webp" }, 1)).toBe(photos[1]);
    expect(photoForImage(photos, { id: "img_hero", src: "uploads/hero.webp" }, 7)).toBeUndefined();
  });
});
