import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/server";

/** Better Auth endpoints: /api/auth/* (sessions, Google/Apple callbacks, phone codes). */
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(auth);
