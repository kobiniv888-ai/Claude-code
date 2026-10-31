import { headers } from "next/headers";
import { JsonLd } from "@/components/common/json-ld";

/** schema.org FAQPage structured data for the help center (answers as plain text). */
export async function FaqJsonLd({ items, url }: { items: { question: string; answer: string }[]; url: string }) {
  if (!items.length) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <JsonLd
      nonce={nonce}
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        url,
        mainEntity: items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }}
    />
  );
}
