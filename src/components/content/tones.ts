/** Tinted color pairs (background + foreground) used by icon circles and cards. */
export type Tone = "primary" | "terracotta" | "verified" | "warning" | "wine" | "destructive" | "muted";

export const toneClasses: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  terracotta: "bg-terracotta/10 text-terracotta",
  verified: "bg-verified-soft text-verified",
  warning: "bg-warning-soft text-warning",
  wine: "bg-wine/10 text-wine",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};
