import { z } from "zod";
import { FIRST_NAME_MAX, looksLikeContact, tidy } from "./first-name";

/*
 * Kept apart from ./first-name so the pure helpers there do not bring zod into client bundles that
 * only need them (e.g. the booking review page).
 */

/** The first-name form (sign-up step and settings). Error messages are keys in `auth.name.errors`. */
export const firstNameSchema = z.object({
  firstName: z
    .string()
    .transform(tidy)
    .pipe(
      z
        .string()
        .min(1, "required")
        .max(FIRST_NAME_MAX, "too_long")
        .refine((value) => !looksLikeContact(value), "not_a_name"),
    ),
});
