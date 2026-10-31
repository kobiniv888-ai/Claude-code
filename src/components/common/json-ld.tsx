/**
 * Structured data for search engines (schema.org JSON-LD).
 *
 *   <JsonLd data={{ "@context": "https://schema.org", "@type": "Product", … }} nonce={nonce} />
 *
 * "<" is escaped so user text can never close the script tag.
 */
export function JsonLd({ data, nonce }: { data: Record<string, unknown> | Record<string, unknown>[]; nonce?: string }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />;
}
