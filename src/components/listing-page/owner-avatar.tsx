import Image from "next/image";
import { avatarInitial } from "@/lib/account/greeting";
import { cn } from "@/lib/utils";

/** The owner's photo, or the first letter of their first name on a tinted circle. */
export function OwnerAvatar({ name, image, size = 56, className }: { name: string; image: string | null; size?: number; className?: string }) {
  const initials = avatarInitial({ name });
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
