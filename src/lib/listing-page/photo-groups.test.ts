import { describe, expect, it } from "vitest";
import { PHOTO_ROOMS } from "@/lib/listing/fields";
import { GALLERY_ROOM_ORDER, groupPhotosByRoom } from "./photo-groups";

const photo = (id: string, room: (typeof PHOTO_ROOMS)[number] | null = null) => ({ id, room });

describe("groupPhotosByRoom", () => {
  it("keeps the same room order as the post form's labels", () => {
    expect([...GALLERY_ROOM_ORDER]).toEqual([...PHOTO_ROOMS]);
  });

  it("stays one grid with fewer than two labelled rooms", () => {
    expect(groupPhotosByRoom([photo("a"), photo("b")])).toBeNull();
    expect(groupPhotosByRoom([photo("a", "KITCHEN"), photo("b", "KITCHEN"), photo("c")])).toBeNull();
  });

  it("groups by room in a fixed order, the host's order inside a room, unlabelled photos last", () => {
    const groups = groupPhotosByRoom([
      photo("cover", "LIVING_ROOM"),
      photo("k1", "KITCHEN"),
      photo("x"),
      photo("b1", "BEDROOM"),
      photo("k2", "KITCHEN"),
      photo("v", "VIEW"),
    ]);
    expect(groups?.map((g) => [g.room, g.photos.map((p) => p.id), g.start])).toEqual([
      ["BEDROOM", ["b1"], 0],
      ["KITCHEN", ["k1", "k2"], 1],
      ["LIVING_ROOM", ["cover"], 3],
      ["VIEW", ["v"], 4],
      [null, ["x"], 5],
    ]);
  });

  it("has no 'other photos' section when every photo is labelled", () => {
    const groups = groupPhotosByRoom([photo("a", "BEDROOM"), photo("b", "BATHROOM")]);
    expect(groups?.map((g) => g.room)).toEqual(["BEDROOM", "BATHROOM"]);
  });
});
