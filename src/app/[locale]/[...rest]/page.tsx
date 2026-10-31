import { notFound } from "next/navigation";

/** Any unknown address under a language (/he/does-not-exist) shows the designed 404 page. */
export default function CatchAll() {
  notFound();
}
