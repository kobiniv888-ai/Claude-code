import { cn } from "@/lib/utils";
import "./welcome-door.css";

/**
 * Sign-in illustration, drawn for Bayit: a key turns in a front door with a mezuzah, the door
 * opens onto warm light, a heart floats out and a green check pops up. A gentle 6-second CSS loop
 * (transform and opacity only); with reduced motion it is a still picture of the open door.
 * Colors come from the theme tokens, so it follows light and dark mode. Decorative (aria-hidden).
 *
 *   <WelcomeDoorIllustration className="w-40" />
 */
export function WelcomeDoorIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 140"
      aria-hidden="true"
      focusable="false"
      className={cn("bayit-door h-auto w-44 overflow-visible", className)}
    >
      {/* Backdrop and floor shadow */}
      <circle cx="100" cy="70" r="60" fill="var(--primary-tint)" />
      <ellipse cx="100" cy="127" rx="52" ry="4" fill="var(--primary)" opacity="0.14" />

      {/* Door frame */}
      <path
        d="M66 126V64a34 34 0 0 1 68 0v62z"
        fill="var(--card)"
        stroke="var(--primary)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Warm light inside */}
      <path d="M76 126V66a24 24 0 0 1 48 0v60z" fill="var(--surface-muted)" />
      <g data-part="glow">
        <ellipse cx="100" cy="102" rx="19" ry="26" fill="var(--muted-foreground)" opacity="0.28" />
        <ellipse cx="100" cy="110" rx="11" ry="14" fill="var(--muted-foreground)" opacity="0.3" />
      </g>
      {/* A heart floats out of the open door */}
      <path
        data-part="heart"
        d="M100 99c-5.6-3.6-8.2-6.4-8.2-9.4 0-2.3 1.8-4 4-4 1.7 0 3.2.9 4.2 2.4 1-1.5 2.5-2.4 4.2-2.4 2.2 0 4 1.7 4 4 0 3-2.6 5.8-8.2 9.4z"
        fill="var(--primary)"
      />

      {/* The door (hinged on the start side of the picture) */}
      <g data-part="door">
        <path d="M76 126V66a24 24 0 0 1 48 0v60z" fill="var(--primary)" />
        <path d="M83 93V71a17 17 0 0 1 34 0v22z" fill="var(--card)" opacity="0.16" />
        <rect x="83" y="99" width="34" height="21" rx="3" fill="var(--card)" opacity="0.16" />
        <circle cx="116" cy="104" r="2.8" fill="var(--muted-foreground)" />
        <circle cx="116" cy="110" r="1.3" fill="var(--card)" opacity="0.75" />
      </g>

      {/* Mezuzah on the doorpost */}
      <rect x="127" y="73" width="4.2" height="16" rx="1.6" fill="var(--primary)" transform="rotate(-18 129 81)" />

      {/* The key: slides in and turns */}
      <g data-part="key">
        <rect x="116" y="108.6" width="27" height="2.8" rx="1.4" fill="var(--primary)" />
        <path d="M118.5 111h2.6v3.4h-2.6zM123 111h2.2v2.4H123z" fill="var(--primary)" />
        <circle cx="149" cy="110" r="5.8" fill="none" stroke="var(--primary)" strokeWidth="3" />
      </g>

      {/* Check badge */}
      <g data-part="check">
        <circle cx="146" cy="42" r="13" fill="var(--success)" stroke="var(--card)" strokeWidth="3" />
        <path
          d="m140.4 42.4 3.9 3.9 7.4-7.7"
          fill="none"
          stroke="var(--success-foreground)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Floating dots and sparkles */}
      <circle data-part="dot" cx="42" cy="48" r="3.6" fill="var(--primary)" opacity="0.85" />
      <circle data-part="dot" cx="166" cy="94" r="3" fill="var(--primary)" opacity="0.45" style={{ "--delay": "-1.2s" } as React.CSSProperties} />
      <circle data-part="dot" cx="50" cy="104" r="2.6" fill="var(--success)" opacity="0.75" style={{ "--delay": "-2.1s" } as React.CSSProperties} />
      <circle data-part="dot" cx="118" cy="14" r="2.2" fill="var(--primary)" opacity="0.6" style={{ "--delay": "-0.6s" } as React.CSSProperties} />
      <g transform="translate(58 26)">
        <path data-part="spark" d="M0-6 1.6-1.6 6 0 1.6 1.6 0 6-1.6 1.6-6 0-1.6-1.6z" fill="var(--muted-foreground)" />
      </g>
      <g transform="translate(176 62)">
        <path
          data-part="spark"
          d="M0-4.5 1.2-1.2 4.5 0 1.2 1.2 0 4.5-1.2 1.2-4.5 0-1.2-1.2z"
          fill="var(--primary)"
          style={{ "--delay": "-1.1s" } as React.CSSProperties}
        />
      </g>
    </svg>
  );
}
