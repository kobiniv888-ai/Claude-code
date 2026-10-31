import Image from "next/image";
import { cn } from "@/lib/utils";

/** The owner's photo, or their initials on a tinted circle. */
export function OwnerAvatar({ name, image, size = 56, className }: { name: string; image: string | null; size?: number; className?: string }) {
  const initials = name
    .replace(/[—–-].*$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-primary", className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {image ? <Image src={image} alt="" fill sizes={`${size}px`} unoptimized className="object-cover" /> : initials || "?"}
    </span>
  );
}
