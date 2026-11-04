import { describe, expect, it } from "vitest";
import {
  activeBottomNavKey,
  activeNavKey,
  bottomNavIndicator,
  DEAL_NAV_KEYS,
  DESKTOP_TAB_ITEMS,
  isBottomNavHidden,
  NAV_ITEMS,
  normalizePath,
  pathWithQuery,
} from "./nav-items";

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
    expect(activeNavKey("/search", "deal=short-stay")).toBe("shortStay");
    expect(activeNavKey("/search", "?deal=monthly&city=tbilisi")).toBe("monthly");
    expect(activeNavKey("/search", "deal=buy")).toBe("buy");
    expect(activeNavKey("/search", new URLSearchParams({ deal: "hotels" }))).toBe("hotels");
    expect(activeNavKey("/search")).toBeNull();
  });
  it("has no tab for the old combined 'rent' filter or unknown deals", () => {
    expect(activeNavKey("/search", "deal=rent")).toBeNull();
    expect(activeNavKey("/search", "deal=toString")).toBeNull();
    expect(activeNavKey("/search", "deal=__proto__")).toBeNull();
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
    expect(activeNavKey("/buy")).toBe("buy");
  });
  it("does not match look-alike paths", () => {
    expect(activeNavKey("/helpers")).toBeNull();
    expect(activeNavKey("/aboutus")).toBeNull();
    expect(activeNavKey("/")).toBeNull();
    expect(activeNavKey("/listing/12-flat")).toBeNull();
  });
});

describe("main navigation (round 3)", () => {
  it("starts with the home page's four deal tabs, in its order, with no 'Rent'", () => {
    expect(NAV_ITEMS.slice(0, 4).map((item) => item.key)).toEqual(["shortStay", "monthly", "buy", "hotels"]);
    expect(DEAL_NAV_KEYS).toEqual(["shortStay", "monthly", "buy", "hotels"]);
    expect(NAV_ITEMS.map((item) => item.key)).not.toContain("rent");
    expect(NAV_ITEMS.find((item) => item.key === "shortStay")?.href).toBe("/search?deal=short-stay");
    expect(NAV_ITEMS.find((item) => item.key === "monthly")?.href).toBe("/search?deal=monthly");
  });

  it("leaves About out of the desktop tabs (it stays in the menu and the footer)", () => {
    expect(DESKTOP_TAB_ITEMS.map((item) => item.key)).toEqual(["shortStay", "monthly", "buy", "hotels", "map", "jewishLife", "help"]);
    expect(NAV_ITEMS.map((item) => item.key)).toContain("about");
  });

  it("links every tab to the page that marks it current", () => {
    for (const item of NAV_ITEMS) {
      const [path, query = ""] = item.href.split("?");
      expect(activeNavKey(path, query), item.key).toBe(item.key);
    }
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

describe("bottomNavIndicator", () => {
  it("sits under the active tab's column", () => {
    expect(bottomNavIndicator("home")).toEqual({ index: 0, visible: true });
    expect(bottomNavIndicator("saved")).toEqual({ index: 3, visible: true });
    expect(bottomNavIndicator("profile")).toEqual({ index: 4, visible: true });
  });

  it("hides on the Post tab and on pages without a tab", () => {
    expect(bottomNavIndicator("post")).toEqual({ index: 2, visible: false });
    expect(bottomNavIndicator(null)).toEqual({ index: 0, visible: false });
  });
});
