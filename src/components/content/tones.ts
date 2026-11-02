/** Tinted color pairs (background + foreground) used by icon circles and cards. */
export type Tone = "primary" | "terracotta" | "verified" | "warning" | "wine" | "destructive" | "muted";

export const toneClasses: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  terracotta: "bg-primary/10 text-primary-text",
  verified: "bg-primary-tint text-success",
  warning: "bg-surface-muted text-foreground",
  wine: "bg-primary/10 text-primary-text",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};
