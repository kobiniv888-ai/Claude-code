"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { withParams } from "@/lib/admin/params";
import { cn } from "@/lib/utils";

/**
 * Filters of an admin list, kept in the URL. Selects apply right away; text and date fields apply
 * when the form is submitted (Enter or the search button).
 */

export type FilterField =
  | {
      type: "select";
      name: string;
      label: string;
      options: { value: string; label: string }[];
      /** Label of the "no filter" option; omit when a value is always chosen. */
      allLabel?: string;
      /** The value used when the URL has none. */
      defaultValue?: string;
    }
  | { type: "search"; name: string; label: string; placeholder?: string; wide?: boolean }
  | { type: "date"; name: string; label: string };

const ALL = "__all__";

export function AdminFilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const t = useTranslations("admin.filters");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const textFields = fields.filter((f) => f.type !== "select");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(textFields.map((f) => [f.name, params.get(f.name) ?? ""])),
  );

  function go(patch: Record<string, string | null>) {
    startTransition(() => router.replace(`${pathname}${withParams(new URLSearchParams(params.toString()), patch)}`));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    go(Object.fromEntries(textFields.map((f) => [f.name, values[f.name]?.trim() || null])));
  }

  const active = fields.some((f) => {
    const v = params.get(f.name);
    return !!v && !(f.type === "select" && f.defaultValue === v);
  });

  return (
    <form
      role="search"
      onSubmit={submit}
      aria-busy={pending || undefined}
      className={cn("mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3 shadow-xs", className)}
    >
      {fields.map((field) => {
        const id = `filter-${field.name}`;
        if (field.type === "select") {
          const current = params.get(field.name) ?? field.defaultValue ?? ALL;
          return (
            <div key={field.name} className="flex min-w-[9.5rem] flex-1 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor={id} className="text-xs text-muted-foreground">
                {field.label}
              </Label>
              <Select
                value={current}
                onValueChange={(value) => go({ [field.name]: value === ALL || value === field.defaultValue ? null : value })}
              >
                <SelectTrigger id={id} className="h-9 w-full sm:w-auto sm:min-w-[9.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.allLabel ? <SelectItem value={ALL}>{field.allLabel}</SelectItem> : null}
                  {field.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return (
          <div
            key={field.name}
            className={cn(
              "flex flex-col gap-1.5",
              field.type === "search" ? (field.wide ? "min-w-full flex-1 sm:min-w-[18rem]" : "min-w-[12rem] flex-1") : "w-full sm:w-auto",
            )}
          >
            <Label htmlFor={id} className="text-xs text-muted-foreground">
              {field.label}
            </Label>
            <Input
              id={id}
              type={field.type === "date" ? "date" : "search"}
              // Empty, a dir="auto" field shows its Hebrew example text left to right ("…או #1234"):
              // the page's direction until something is typed.
              dir={field.type === "date" ? "ltr" : values[field.name] ? "auto" : undefined}
              value={values[field.name] ?? ""}
              placeholder={field.type === "search" ? field.placeholder : undefined}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              className="h-9"
            />
          </div>
        );
      })}
      {/* Only when it holds a button: an empty one still takes a gap, so the last select on a
          phone line came out 12px narrower than the others. */}
      {textFields.length || active ? (
        <div className="flex items-center gap-2">
          {textFields.length ? (
            <Button type="submit" size="sm" className="h-9" disabled={pending}>
              <Search aria-hidden />
              {t("apply")}
            </Button>
          ) : null}
          {active ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setValues(Object.fromEntries(textFields.map((f) => [f.name, ""])));
                startTransition(() => router.replace(pathname));
              }}
            >
              <X aria-hidden />
              {t("reset")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
