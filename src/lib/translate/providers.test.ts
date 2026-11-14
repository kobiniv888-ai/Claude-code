import { describe, expect, it, vi } from "vitest";
import { AZURE_MAX_CHARS, azureProvider, azureTargetGroups, azureTranslateUrl } from "./azure";
import { googleProvider } from "./google";
import { baseLanguage, chooseTranslationProvider } from "./provider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("chooseTranslationProvider", () => {
  it("defaults to Azure when its key is set, else Google, else off", () => {
    expect(chooseTranslationProvider({ AZURE_TRANSLATOR_KEY: "a", GOOGLE_TRANSLATE_API_KEY: "g" })).toBe("azure");
    expect(chooseTranslationProvider({ GOOGLE_TRANSLATE_API_KEY: "g" })).toBe("google");
    expect(chooseTranslationProvider({ AZURE_TRANSLATOR_KEY: "  " })).toBeNull();
    expect(chooseTranslationProvider({})).toBeNull();
  });
  it("follows TRANSLATE_PROVIDER, and never silently uses another service", () => {
    expect(chooseTranslationProvider({ TRANSLATE_PROVIDER: "google", AZURE_TRANSLATOR_KEY: "a", GOOGLE_TRANSLATE_API_KEY: "g" })).toBe("google");
    expect(chooseTranslationProvider({ TRANSLATE_PROVIDER: "Azure", AZURE_TRANSLATOR_KEY: "a" })).toBe("azure");
    expect(chooseTranslationProvider({ TRANSLATE_PROVIDER: "azure", GOOGLE_TRANSLATE_API_KEY: "g" })).toBeNull();
    expect(chooseTranslationProvider({ TRANSLATE_PROVIDER: "claude", AZURE_TRANSLATOR_KEY: "a" })).toBeNull();
  });
  it("normalizes language codes", () => {
    expect(baseLanguage("iw")).toBe("he");
    expect(baseLanguage("he-IL")).toBe("he");
    expect(baseLanguage(undefined)).toBeUndefined();
  });
});

describe("Azure AI Translator adapter", () => {
  it("asks for every target language in one request, with the key in a header", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { translations: [{ text: "Sunny flat", to: "en" }, { text: "Солнечная квартира", to: "ru" }] },
        { translations: [{ text: "Near the sea.", to: "en" }, { text: "У моря.", to: "ru" }] },
      ]),
    );
    const provider = azureProvider("secret-key", "westeurope", fetchImpl as unknown as typeof fetch);
    const result = await provider.translate(["דירה שטופת שמש", "ליד הים."], ["en", "ru"], "he");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&textType=plain&from=he&to=en&to=ru");
    expect(url).not.toContain("secret-key");
    expect(init.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "secret-key", "Ocp-Apim-Subscription-Region": "westeurope" });
    expect(JSON.parse(String(init.body))).toEqual([{ Text: "דירה שטופת שמש" }, { Text: "ליד הים." }]);
    expect(result?.get("en")?.map((t) => t.text)).toEqual(["Sunny flat", "Near the sea."]);
    expect(result?.get("ru")?.map((t) => t.text)).toEqual(["Солнечная квартира", "У моря."]);
  });

  it("keeps empty texts empty, sends only the others, and reads the detected language", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ detectedLanguage: { language: "ka" }, translations: [{ text: "שלום", to: "he" }] }]));
    const provider = azureProvider("k", "", fetchImpl as unknown as typeof fetch);
    const result = await provider.translate(["", "გამარჯობა"], ["he"]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("from=");
    expect(init.headers).not.toHaveProperty("Ocp-Apim-Subscription-Region");
    expect(JSON.parse(String(init.body))).toEqual([{ Text: "გამარჯობა" }]);
    expect(result?.get("he")).toEqual([{ text: "" }, { text: "שלום", detected: "ka" }]);
  });

  it("splits long texts over several requests to stay under 50,000 characters", () => {
    expect(azureTargetGroups(10_000, ["en", "ru", "ar", "ka"])).toEqual([["en", "ru", "ar", "ka"]]);
    expect(azureTargetGroups(20_000, ["en", "ru", "ar", "ka"])).toEqual([["en", "ru"], ["ar", "ka"]]);
    expect(azureTargetGroups(AZURE_MAX_CHARS, ["en", "ru"])).toEqual([["en"], ["ru"]]);
    expect(azureTranslateUrl(["ka"])).toContain("to=ka");
  });

  it("returns null (never throws) on errors and on answers missing a language", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = azureProvider("k", null, (async () => jsonResponse({ error: { code: 401000, message: "bad key" } }, 401)) as unknown as typeof fetch);
    expect(await failing.translate(["a"], ["en"])).toBeNull();
    const partial = azureProvider("k", null, (async () => jsonResponse([{ translations: [{ text: "x", to: "en" }] }])) as unknown as typeof fetch);
    expect(await partial.translate(["a"], ["en", "ru"])).toBeNull();
    const network = azureProvider("k", null, (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect(await network.translate(["a"], ["en"])).toBeNull();
  });
});

describe("Google adapter", () => {
  it("sends one request per language and maps Google's iw to he", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { target: string };
      return jsonResponse({ data: { translations: [{ translatedText: `[${body.target}] hi`, detectedSourceLanguage: "iw" }] } });
    });
    const provider = googleProvider("gkey", fetchImpl as unknown as typeof fetch);
    const result = await provider.translate(["היי"], ["en", "ka"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "X-Goog-Api-Key": "gkey" });
    expect(result?.get("ka")).toEqual([{ text: "[ka] hi", detected: "he" }]);
  });
});
