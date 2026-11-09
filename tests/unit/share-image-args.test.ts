/**
 * exposure-e2e-1 (SECURITY_REPORT 5.f): what the share images DRAW. The e2e spec can only see that
 * an image came back; this checks the inputs: the listing and the shared-list opengraph-image
 * routes hand listingShareImage only the brand name, the tagline, a title, a price line and a
 * photo URL — never an address, a pin, a phone, the host or the list's owner — even when the data
 * they load carries such fields.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ listing: [] as Record<string, unknown>[], brand: [] as Record<string, unknown>[] }));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/og/share-image", () => ({
  OG_SIZE: { width: 1200, height: 630 },
  asJpeg: async (image: unknown) => new Response(JSON.stringify(image)),
  brandShareImage: async (input: Record<string, unknown>) => (calls.brand.push(input), input),
  listingShareImage: async (input: Record<string, unknown>) => (calls.listing.push(input), input),
}));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ demoDataVisible: true }) }));
vi.mock("@/lib/listing-page/access", () => ({ listingAccess: () => "public" }));
vi.mock("@/lib/rate-limit", () => ({ rateLimitByIp: async () => ({ ok: true }) }));

/** Private values a loader might carry by mistake: none may reach the image. */
const PRIVATE = {
  address: "17 Exposure Lane, Mestia",
  lat: 43.0456789,
  lng: 42.7234567,
  phone: "+995555990017",
  email: "host@e2e.bayit.invalid",
  ownerId: "owner-1",
};

vi.mock("@/lib/listing-page/load", () => ({
  getListingPage: async () => ({
    access: {},
    data: {
      title: { shown: "A flat in Mestia" },
      price: 80,
      currency: "USD",
      pricePeriod: "NIGHT",
      priceIsFrom: false,
      ogImage: "https://bayit.example/api/media/listing/x/og.jpg",
      contactMethods: [{ channel: "WHATSAPP", value: PRIVATE.phone }],
      host: { id: PRIVATE.ownerId, email: PRIVATE.email },
      ...PRIVATE,
    },
  }),
}));
vi.mock("@/lib/lists/server", () => ({
  getSharedList: async () => ({ id: "list-1", name: "Summer", userId: PRIVATE.ownerId, owner: { email: PRIVATE.email }, listingIds: ["a", "b"] }),
  publicListName: (shared: { name: string }) => shared.name,
  sharedListCoverUrl: async () => "https://bayit.example/api/media/listing/a/og.jpg",
}));

const ALLOWED = ["name", "photoUrl", "price", "tagline", "title"];

beforeEach(() => {
  calls.listing.length = 0;
  calls.brand.length = 0;
});

describe("share images draw only public fields (5.f)", () => {
  it("the listing image", async () => {
    const { default: Image } = await import("@/app/[locale]/(site)/listing/[id]/opengraph-image");
    await Image({ params: Promise.resolve({ locale: "he", id: "89" }) });
    expect(calls.listing).toHaveLength(1);
    expect(Object.keys(calls.listing[0]).sort()).toEqual(ALLOWED);
    const drawn = JSON.stringify(calls.listing[0]);
    for (const value of Object.values(PRIVATE)) expect(drawn).not.toContain(String(value));
  });

  it("the shared list image", async () => {
    const { default: Image } = await import("@/app/[locale]/(site)/lists/[token]/opengraph-image");
    const response = await Image({ params: Promise.resolve({ locale: "he", token: "t".repeat(43) }) });
    expect(response.status).toBe(200);
    expect(calls.listing).toHaveLength(1);
    expect(Object.keys(calls.listing[0]).sort()).toEqual(ALLOWED);
    const drawn = JSON.stringify(calls.listing[0]);
    for (const value of Object.values(PRIVATE)) expect(drawn).not.toContain(String(value));
  });
});
