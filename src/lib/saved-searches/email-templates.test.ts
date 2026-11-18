import { describe, expect, it } from "vitest";
import type { TemplateContext } from "@/lib/email/templates";
import { savedAlertEmailBuilders, type SavedAlertEmailData } from "./email-templates";

// A translator that shows the key and its values, so the test sees which money was formatted.
const t = (key: string, values?: Record<string, string | number>) => (values ? `${key}(${Object.values(values).join("|")})` : key);
const ctx: TemplateContext = { locale: "en", t, tb: t, url: (p) => (p ? `https://example.com${p}` : null), page: (p) => `https://example.com/en${p}`, formatDate: String, brand: "Bayit" };

const base: SavedAlertEmailData["price_drop"] = {
  name: "Dana",
  // The card: a hidden room's dollars once showed here (lists-alerts-7).
  place: { title: "Hotel", publicId: 7, url: "/listing/7-hotel", place: "Batumi", price: 40, currency: "USD", pricePeriod: "NIGHT", priceIsFrom: true },
  oldPrice: 150,
  newPrice: 130,
  pct: 13,
  manageUrl: "/account/alerts",
  unsubscribeUrl: "/unsubscribe?t=x",
};

function rows(data: SavedAlertEmailData["price_drop"]) {
  const content = savedAlertEmailBuilders.price_drop(data, ctx);
  const details = content.blocks.find((b) => b.type === "details") as { rows: { label: string; value: string }[] };
  return { details: details.rows.map((r) => r.value).join("\n"), preheader: content.preheader };
}

describe("the price-drop email's prices", () => {
  it("are written in the watched price's currency and period, not the card's", () => {
    const { details, preheader } = rows({ ...base, money: { currency: "GEL", pricePeriod: "NIGHT", priceIsFrom: true } });
    expect(details).toContain("₾150");
    expect(details).toContain("₾130");
    expect(details).not.toContain("$");
    expect(preheader).toContain("₾130");
  });

  it("fall back to the card's money for data without it", () => {
    expect(rows(base).details).toContain("$150");
  });
});
