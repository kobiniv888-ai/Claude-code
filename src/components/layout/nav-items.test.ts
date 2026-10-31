import { describe, expect, it } from "vitest";
import { activeBottomNavKey, activeNavKey, isBottomNavHidden, normalizePath, pathWithQuery } from "./nav-items";

describe("normalizePath", () => {
  it("drops trailing slashes, queries and hashes", () => {
    expect(normalizePath("/search/")).toBe("/search");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/help?q=1#top")).toBe("/help");
  });
});

describe("activeNavKey", () => {
  it("matches search tabs by their filters", () => {
    expect(activeNavKey("/search", "deal=rent")).toBe("rent");
    expect(activeNavKey("/search", "?deal=monthly&city=tbilisi")).toBe("rent");
    expect(activeNavKey("/search", "deal=short-stay")).toBe("rent");
    expect(activeNavKey("/search", "deal=buy")).toBe("buy");
    expect(activeNavKey("/search", new URLSearchParams({ deal: "hotels" }))).toBe("hotels");
    expect(activeNavKey("/search")).toBeNull();
  });
  it("prefers the map tab when the map view is open", () => {
    expect(activeNavKey("/search", "deal=buy&view=map")).toBe("map");
  });
  it("matches content sections and their sub-pages", () => {
    expect(activeNavKey("/jewish-life")).toBe("jewishLife");
    expect(activeNavKey("/jewish-life/calendar")).toBe("jewishLife");
    expect(activeNavKey("/about")).toBe("about");
    expect(activeNavKey("/how-it-works")).toBe("about");
    expect(activeNavKey("/help/new-ticket")).toBe("help");
    expect(activeNavKey("/rent")).toBe("rent");
  });
  it("does not match look-alike paths", () => {
    expect(activeNavKey("/helpers")).toBeNull();
    expect(activeNavKey("/aboutus")).toBeNull();
    expect(activeNavKey("/")).toBeNull();
    expect(activeNavKey("/listing/12-flat")).toBeNull();
  });
});

describe("activeBottomNavKey", () => {
  it("maps pages to bottom-bar items", () => {
    expect(activeBottomNavKey("/")).toBe("home");
    expect(activeBottomNavKey("/search")).toBe("search");
    expect(activeBottomNavKey("/post/step/3")).toBe("post");
    expect(activeBottomNavKey("/account/favorites")).toBe("saved");
    expect(activeBottomNavKey("/account/compare")).toBe("saved");
    expect(activeBottomNavKey("/account")).toBe("profile");
    expect(activeBottomNavKey("/account/settings")).toBe("profile");
    expect(activeBottomNavKey("/login")).toBe("profile");
    expect(activeBottomNavKey("/about")).toBeNull();
    expect(activeBottomNavKey("/postal")).toBeNull();
  });
});

describe("isBottomNavHidden", () => {
  it("hides the bar in the admin panel only", () => {
    expect(isBottomNavHidden("/admin")).toBe(true);
    expect(isBottomNavHidden("/admin/listings")).toBe(true);
    expect(isBottomNavHidden("/administrator")).toBe(false);
    expect(isBottomNavHidden("/")).toBe(false);
  });
});

describe("pathWithQuery", () => {
  it("keeps the path and query for the language switcher", () => {
    expect(pathWithQuery("/search", "deal=buy&city=batumi")).toBe("/search?deal=buy&city=batumi");
    expect(pathWithQuery("/search", "?deal=buy")).toBe("/search?deal=buy");
    expect(pathWithQuery("/about/", "")).toBe("/about");
    expect(pathWithQuery("/", new URLSearchParams())).toBe("/");
  });
});
