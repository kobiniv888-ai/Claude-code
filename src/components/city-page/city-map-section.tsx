import { CityMap, type CityMapLabels } from "./city-map";
import { CitySectionHeading } from "./city-section-heading";

/**
 * "על המפה": the lazy search map of the page's listings (only their approximate areas) and a
 * line saying so. The map's code and points load only near the viewport or on "Show the map".
 */
export function CityMapSection({
  id,
  title,
  note,
  query,
  citySlug,
  labels,
}: {
  id: string;
  title: string;
  note: string;
  /** The search query of the page's listings: "deal=short-stay&city=batumi". */
  query: string;
  citySlug: string;
  labels: CityMapLabels;
}) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-3">
      <CitySectionHeading id={id} title={title} />
      <CityMap query={query} citySlug={citySlug} labels={labels} />
      <p className="text-small text-muted-foreground">{note}</p>
    </section>
  );
}
