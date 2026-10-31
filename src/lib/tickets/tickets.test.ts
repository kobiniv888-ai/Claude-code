import { describe, expect, it } from "vitest";
import {
  attachmentUrl,
  isAttachmentKeyOwnedBy,
  isInlineImage,
  parseAttachments,
  safeDownloadName,
  ticketAttachmentsSchema,
} from "./attachments";
import {
  canUserClose,
  canUserRate,
  canUserReply,
  parseTicketNumber,
  priorityForCategory,
  statusAfterStaffReply,
  statusAfterUserReply,
  statusStepIndex,
  ticketPath,
} from "./constants";
import { parseListingRef } from "./listing-ref";
import { contactFormSchema, createTicketSchema, fieldErrorKey, rateTicketSchema, replySchema } from "./schemas";

describe("parseListingRef", () => {
  it("accepts plain numbers and short labels", () => {
    expect(parseListingRef("1234")).toBe(1234);
    expect(parseListingRef("  #1234 ")).toBe(1234);
    expect(parseListingRef("ID 1234")).toBe(1234);
    expect(parseListingRef("ID: 1234")).toBe(1234);
    expect(parseListingRef("מודעה 1234")).toBe(1234);
    expect(parseListingRef("№ 77")).toBe(77);
  });

  it("reads the number from listing addresses", () => {
    expect(parseListingRef("https://bayit.example/he/listing/1234-sunny-flat-in-vake")).toBe(1234);
    expect(parseListingRef("http://localhost:3000/en/listing/56?ref=share")).toBe(56);
    expect(parseListingRef("/ru/listing/9#photos")).toBe(9);
    expect(parseListingRef("bayit.example/ka/listing/321")).toBe(321);
  });

  it("rejects anything else", () => {
    expect(parseListingRef("")).toBeNull();
    expect(parseListingRef(null)).toBeNull();
    expect(parseListingRef("0")).toBeNull();
    expect(parseListingRef("12 34")).toBeNull();
    expect(parseListingRef("https://example.com/listing/abc")).toBeNull();
    expect(parseListingRef("https://example.com/search?page=2")).toBeNull();
    expect(parseListingRef("my apartment on rustaveli avenue 12")).toBeNull();
    expect(parseListingRef("99999999999")).toBeNull();
  });
});

describe("ticket status rules", () => {
  it("scam reports are urgent", () => {
    expect(priorityForCategory("SCAM_REPORT")).toBe("URGENT");
    expect(priorityForCategory("TECHNICAL")).toBe("NORMAL");
  });

  it("a user reply reopens waiting and resolved tickets", () => {
    expect(statusAfterUserReply("WAITING_FOR_USER")).toBe("OPEN");
    expect(statusAfterUserReply("RESOLVED")).toBe("OPEN");
    expect(statusAfterUserReply("IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(statusAfterUserReply("OPEN")).toBe("OPEN");
  });

  it("a staff reply picks up open tickets", () => {
    expect(statusAfterStaffReply("OPEN")).toBe("IN_PROGRESS");
    expect(statusAfterStaffReply("WAITING_FOR_USER")).toBe("WAITING_FOR_USER");
  });

  it("closed tickets cannot be answered or closed again; rating happens once while resolved", () => {
    expect(canUserReply("CLOSED")).toBe(false);
    expect(canUserReply("RESOLVED")).toBe(true);
    expect(canUserClose("CLOSED")).toBe(false);
    expect(canUserRate({ status: "RESOLVED", rating: null })).toBe(true);
    expect(canUserRate({ status: "RESOLVED", rating: 4 })).toBe(false);
    expect(canUserRate({ status: "IN_PROGRESS", rating: null })).toBe(false);
  });

  it("orders the progress steps", () => {
    expect(statusStepIndex("OPEN")).toBe(0);
    expect(statusStepIndex("WAITING_FOR_USER")).toBe(2);
    expect(statusStepIndex("CLOSED")).toBe(4);
  });

  it("parses ticket numbers from URLs", () => {
    expect(parseTicketNumber("42")).toBe(42);
    expect(parseTicketNumber(" 7 ")).toBe(7);
    expect(parseTicketNumber("0")).toBeNull();
    expect(parseTicketNumber("4e2")).toBeNull();
    expect(parseTicketNumber("-3")).toBeNull();
    expect(parseTicketNumber("99999999999")).toBeNull();
    expect(ticketPath(42)).toBe("/account/tickets/42");
  });
});

describe("attachments", () => {
  const userId = "usr_abc123";
  const good = { key: `private/ticket/${userId}/Ab3_xY9-k.jpg`, mime: "image/jpeg", bytes: 1000, name: "shot.jpg" };

  it("checks that the key is the user's own ticket upload", () => {
    expect(isAttachmentKeyOwnedBy(good.key, userId)).toBe(true);
    expect(isAttachmentKeyOwnedBy(`private/ticket/usr_other/Ab3.jpg`, userId)).toBe(false);
    // Another purpose (ID documents) can never be attached to a ticket.
    expect(isAttachmentKeyOwnedBy(`private/verification/${userId}/Ab3.jpg`, userId)).toBe(false);
    // The id must be the whole folder name, not part of one.
    expect(isAttachmentKeyOwnedBy(`private/ticket/${userId}x/Ab3.jpg`, userId)).toBe(false);
    expect(isAttachmentKeyOwnedBy(`private/ticket/${userId}/../x/Ab3.jpg`, userId)).toBe(false);
    expect(isAttachmentKeyOwnedBy(good.key, "")).toBe(false);
  });

  it("parses stored JSON safely", () => {
    expect(parseAttachments(null)).toEqual([]);
    expect(parseAttachments([good, { key: "/etc/passwd", mime: "x", bytes: 1, name: "" }, 5])).toEqual([good]);
  });

  it("limits the list to 5 unique files", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...good, key: `private/ticket/${userId}/f${i}.jpg` }));
    expect(ticketAttachmentsSchema.safeParse(many).success).toBe(false);
    expect(ticketAttachmentsSchema.safeParse(many.slice(0, 5)).success).toBe(true);
    expect(ticketAttachmentsSchema.safeParse([good, good]).success).toBe(false);
  });

  it("shows only raster images inline", () => {
    expect(isInlineImage("image/png")).toBe(true);
    expect(isInlineImage("image/webp; charset=binary")).toBe(true);
    expect(isInlineImage("image/svg+xml")).toBe(false);
    expect(isInlineImage("application/pdf")).toBe(false);
  });

  it("builds safe URLs and file names", () => {
    expect(attachmentUrl("a/b c.png")).toBe("/api/tickets/attachment?key=a%2Fb%20c.png");
    expect(safeDownloadName('bad"name/\\.png', "file")).toBe("badname.png");
    expect(safeDownloadName("   ", "file.webp")).toBe("file.webp");
  });
});

describe("schemas", () => {
  const base = { category: "TECHNICAL", subject: "Map does not load", message: "The map stays grey on my phone.", locale: "he" };

  it("accepts a complete ticket and trims text", () => {
    const parsed = createTicketSchema.parse({ ...base, subject: "  Map does not load  " });
    expect(parsed.subject).toBe("Map does not load");
    expect(parsed.attachments).toEqual([]);
    expect(parsed.listingRef).toBe("");
  });

  it("reports field error keys", () => {
    const result = createTicketSchema.safeParse({ ...base, category: "NOPE", subject: "ab", message: "short" });
    expect(result.success).toBe(false);
    const errors = result.success ? {} : result.error.flatten().fieldErrors;
    expect(errors.category?.[0]).toBe("category_required");
    expect(errors.subject?.[0]).toBe("subject_short");
    expect(errors.message?.[0]).toBe("message_short");
  });

  it("validates the contact form email and normalizes it", () => {
    const ok = contactFormSchema.parse({ ...base, name: "Dana", email: "  Dana@Example.COM " });
    expect(ok.email).toBe("dana@example.com");
    const bad = contactFormSchema.safeParse({ ...base, name: "Dana", email: "dana@" });
    expect(bad.success ? null : bad.error.flatten().fieldErrors.email?.[0]).toBe("email_invalid");
  });

  it("checks replies and ratings", () => {
    expect(replySchema.safeParse({ number: 3, message: "x" }).success).toBe(false);
    expect(replySchema.safeParse({ number: 3, message: "Thanks!" }).success).toBe(true);
    expect(rateTicketSchema.safeParse({ number: 3, rating: 0 }).success).toBe(false);
    expect(rateTicketSchema.safeParse({ number: 3, rating: 6 }).success).toBe(false);
    expect(rateTicketSchema.parse({ number: 3, rating: 5 }).comment).toBe("");
  });

  it("maps unknown messages to a generic key", () => {
    expect(fieldErrorKey("subject_long")).toBe("subject_long");
    expect(fieldErrorKey("Expected string, received number")).toBe("invalid");
    expect(fieldErrorKey(undefined)).toBe("invalid");
  });
});
