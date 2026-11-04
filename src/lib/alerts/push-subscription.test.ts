import { describe, expect, it } from "vitest";
import { deviceLabel, isAllowedPushEndpoint, pushSubscriptionSchema } from "./push-subscription";

const KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

describe("push endpoints", () => {
  it("accepts the real push services only", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isAllowedPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
  });
  it("refuses anything that could make the server call an address of the caller's choice", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/fcm")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evilfcm.googleapis.com.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });
  it("validates the browser's subscription", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: KEYS }).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://example.com/x", keys: KEYS }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "short", auth: KEYS.auth } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/abc" }).success).toBe(false);
  });
});

describe("deviceLabel", () => {
  it("names the device and browser without versions", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0")).toBe("Windows · Edge");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Mac · Firefox");
    expect(deviceLabel("")).toBeNull();
    expect(deviceLabel("curl/8.0")).toBeNull();
  });
});
