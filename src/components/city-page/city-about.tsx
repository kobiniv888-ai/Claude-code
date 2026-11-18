import { PhotoSlot } from "@/components/photos/photo-slot";
import { citySlot } from "@/config/photos";

/**
 * "בטומי בקצרה": the 2–3 short paragraphs about the city (checked facts only, marked for the
 * founder's review in the message files) and, beside them on wide screens, the city's photo from
 * the photo registry (credited on /photo-credits). Below the fold: the photo loads lazily.
 */
export function CityAbout({
  id,
  title,
  paragraphs,
  citySlug,
}: {
  id: string;
  title: string;
  paragraphs: string[];
  citySlug: string;
}) {
  if (paragraphs.length === 0) return null;
  const slot = citySlot(citySlug);
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start md:gap-8">
      <div className="grid gap-3">
        <h2 id={id} className="text-h2 text-balance text-foreground">
          {title}
        </h2>
        {paragraphs.map((text, index) => (
          <p key={index} className="max-w-prose text-body text-pretty text-foreground/90">
            {text}
          </p>
        ))}
      </div>
      {slot ? (
        <PhotoSlot
          slot={slot}
          sizes="(min-width: 768px) 352px, 92vw"
          className="aspect-[16/10] rounded-card"
        />
      ) : null}
    </section>
  );
}
