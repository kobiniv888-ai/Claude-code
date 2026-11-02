import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { buttonStyles } from "./button";
import { chipStyles } from "./chip";
import { IconCircle, type IconCircleProps } from "./icon-circle";
import type { IconComponent } from "./jewish-icons";

type Href = ComponentProps<typeof Link>["href"];
export type EmptyStateAction = { label: string; href: Href; icon?: IconComponent } | React.ReactElement;

/**
 * A friendly dead-end replacement: a grey icon in a quiet circle, a title, one line of text,
 * ONE primary action and optional one-tap fixes ("Remove 'Kosher'", "Wider area").
 *
 *   <EmptyState icon={SearchXIcon} title="לא מצאנו נכסים" description="נסו להסיר מסנן"
 *     action={{ label: "התחילו לחפש", href: "/search" }}
 *     quickFixes={[{ label: "הסרת 'כשר'", href: "/search?city=tbilisi" }]} />
 *
 * Pass a ready element (e.g. a client <Button onClick>) as `action` when it is not a link.
 */
export function EmptyState({
  icon,
  tone = "neutral",
  title,
  description,
  action,
  quickFixes,
  headingLevel = 2,
  compact = false,
  className,
}: {
  icon: IconComponent;
  /** Default neutral (grey). Every old tone name draws the same grey circle. */
  tone?: IconCircleProps["tone"];
  /** Plain text, or rich text (e.g. t.rich with a <bdi> around a search query). */
  title: React.ReactNode;
  description?: string;
  action?: EmptyStateAction;
  quickFixes?: ({ label: string; href: Href; icon?: IconComponent } | React.ReactElement)[];
  headingLevel?: 2 | 3;
  /** Less padding (inside sheets and cards). */
  compact?: boolean;
  className?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center text-center",
        compact ? "gap-3 py-6" : "gap-4 py-10",
        className,
      )}
    >
      <IconCircle icon={icon} tone={tone} size={compact ? "md" : "lg"} />
      <div className="flex flex-col gap-1.5">
        <Heading className="text-h2 text-balance text-foreground">{title}</Heading>
        {description ? <p className="text-body text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {action ? (
        "label" in action ? (
          <Link href={action.href} className={buttonStyles({ variant: "primary", size: "md" })}>
            {action.icon ? <action.icon aria-hidden="true" /> : null}
            {action.label}
          </Link>
        ) : (
          action
        )
      ) : null}
      {quickFixes && quickFixes.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {quickFixes.map((fix, i) => (
            <li key={i}>
              {"label" in fix ? (
                <Link href={fix.href} className={chipStyles({ size: "sm" })}>
                  {fix.icon ? <fix.icon aria-hidden="true" /> : null}
                  {fix.label}
                </Link>
              ) : (
                fix
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
