import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation. Always import Link / redirect / useRouter / usePathname
 * from here (not from "next/link" or "next/navigation") so URLs keep their /he, /en… prefix.
 */
export const { Link, redirect, usePathname, useRouter, getPathname, permanentRedirect } =
  createNavigation(routing);
