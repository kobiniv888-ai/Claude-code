"use client";

import { useEffect } from "react";

/** The web app manifest (src/app/manifest.ts). */
const MANIFEST_URL = "/manifest.webmanifest";

/** Adds <link rel="manifest"> once (the root layout leaves it out of the HTML, see its metadata). */
function addManifestLink() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = MANIFEST_URL;
  document.head.appendChild(link);
}

/**
 * After the page has loaded: links the web app manifest (what "Add to Home Screen" and the install
 * prompt read) and registers the service worker (public/sw.js), the latter in production builds
 * only. In development any earlier registration is removed so stale caches never hide code changes.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (document.readyState === "complete") addManifestLink();
    else window.addEventListener("load", addManifestLink, { once: true });
    return () => window.removeEventListener("load", addManifestLink);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((registration) => registration.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("[pwa] service worker registration failed", error);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
