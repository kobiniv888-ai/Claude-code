/**
 * Branded, responsive email HTML (inline styles, table layout, works in Gmail/Outlook/Apple Mail)
 * and the matching plain-text version. Pure — no server imports.
 */
import { siteConfig, type AppLocale } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { isolate, type EmailBlock, type EmailContent } from "./templates";

export type LayoutContext = {
  locale: AppLocale;
  brand: string;
  /** Translator for the "emails" namespace (common.* keys). */
  t: (key: string, values?: Record<string, string | number>) => string;
  page: (path: string) => string;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes and keeps line breaks of user-written text. */
function multiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

const colors = {
  primary: siteConfig.colors.primary,
  accent: siteConfig.colors.accent,
  background: siteConfig.colors.background,
  text: "#1F2937",
  muted: "#5B6472",
  border: "#E7E1D8",
  panel: "#F6F2EC",
  noticeBg: "#FFF7E6",
  noticeBorder: "#F2D59B",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Hebrew', 'Noto Sans Arabic', 'Noto Sans Georgian', Arial, sans-serif";

function renderBlock(block: EmailBlock, align: "left" | "right"): string {
  // Quotes are user-written: dir="auto" + text-align:start let them follow their own language.
  switch (block.type) {
    case "paragraph":
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${colors.text};">${multiline(block.text)}</p>`;
    case "notice":
      return `<p style="margin:0 0 16px;padding:12px 16px;font-size:14px;line-height:1.55;color:${colors.text};background:${colors.noticeBg};border:1px solid ${colors.noticeBorder};border-radius:10px;">${multiline(block.text)}</p>`;
    case "quote": {
      const label = block.label
        ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:${colors.muted};">${escapeHtml(block.label)}</p>`
        : "";
      return `${label}<div dir="auto" style="margin:0 0 16px;padding:14px 16px;font-size:15px;line-height:1.6;color:${colors.text};background:${colors.panel};border-radius:10px;text-align:start;">${multiline(block.text)}</div>`;
    }
    case "details": {
      const rows = block.rows
        .map(
          (row) =>
            `<tr><td style="padding:6px 0;padding-${align === "left" ? "right" : "left"}:16px;font-size:14px;color:${colors.muted};vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</td>` +
            `<td style="padding:6px 0;font-size:14px;color:${colors.text};vertical-align:top;"${row.ltr ? ' dir="ltr"' : ' dir="auto"'}>${escapeHtml(row.value)}</td></tr>`,
        )
        .join("");
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;border-collapse:collapse;">${rows}</table>`;
    }
  }
}

export function renderEmailHtml(content: EmailContent, ctx: LayoutContext): string {
  const dir = dirFor(ctx.locale);
  const align = dir === "rtl" ? "right" : "left";
  const { t, brand, page } = ctx;

  const greeting = content.greetingName
    ? t("common.greeting", { name: isolate(content.greetingName) })
    : t("common.greetingNoName");

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td style="border-radius:10px;background:${colors.accent};">
<a href="${escapeHtml(content.cta.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(content.cta.label)}</a>
</td></tr></table>
<p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:${colors.muted};">${escapeHtml(t("common.buttonFallback"))}<br><a href="${escapeHtml(content.cta.url)}" dir="ltr" style="color:${colors.primary};word-break:break-all;">${escapeHtml(content.cta.url)}</a></p>`
    : "";

  const footerReason = t(content.audience === "account" ? "common.footerAccount" : "common.footerGuest", { brand });
  const footerLinks = [
    { label: t("common.help"), url: page("/help") },
    ...(content.audience === "account" ? [{ label: t("common.settings"), url: page("/account/settings") }] : []),
    { label: t("common.privacy"), url: page("/legal/privacy") },
  ]
    .map((l) => `<a href="${escapeHtml(l.url)}" style="color:${colors.muted};text-decoration:underline;">${escapeHtml(l.label)}</a>`)
    .join(" &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html lang="${ctx.locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
<style>
@media only screen and (max-width: 620px) {
  .container { width: 100% !important; border-radius: 0 !important; }
  .px { padding-left: 20px !important; padding-right: 20px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${colors.background};font-family:${FONT};" dir="${dir}">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(content.preheader)}&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border:1px solid ${colors.border};border-radius:16px;overflow:hidden;">
<tr><td class="px" dir="${dir}" style="background:${colors.primary};padding:20px 32px;text-align:${align};">
<a href="${escapeHtml(page(""))}" style="font-family:${FONT};font-size:24px;font-weight:800;color:#FFFFFF;text-decoration:none;letter-spacing:0.2px;">${escapeHtml(brand)}</a>
<div style="font-size:13px;color:#DCE6F7;margin-top:4px;">${escapeHtml(t("common.tagline"))}</div>
</td></tr>
<tr><td class="px" dir="${dir}" style="padding:32px;text-align:${align};font-family:${FONT};">
<h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;font-weight:800;color:${colors.primary};">${escapeHtml(content.heading)}</h1>
<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${colors.text};">${escapeHtml(greeting)}</p>
${content.blocks.map((b) => renderBlock(b, align)).join("\n")}
${cta}
<p style="margin:0;font-size:16px;line-height:1.6;color:${colors.text};">${escapeHtml(t("common.signoff"))}<br>${escapeHtml(t("common.team", { brand }))}</p>
</td></tr>
<tr><td class="px" dir="${dir}" style="padding:20px 32px;background:${colors.panel};text-align:${align};font-family:${FONT};font-size:12px;line-height:1.6;color:${colors.muted};">
<p style="margin:0 0 8px;">${escapeHtml(t("common.safety", { brand }))}</p>
<p style="margin:0 0 8px;">${escapeHtml(footerReason)}</p>
<p style="margin:0;">${footerLinks}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderEmailText(content: EmailContent, ctx: LayoutContext): string {
  const { t, brand, page } = ctx;
  const lines: string[] = [];
  lines.push(content.heading, "");
  lines.push(
    content.greetingName ? t("common.greeting", { name: isolate(content.greetingName) }) : t("common.greetingNoName"),
    "",
  );
  for (const block of content.blocks) {
    if (block.type === "paragraph" || block.type === "notice") lines.push(block.text, "");
    else if (block.type === "quote") {
      if (block.label) lines.push(`${block.label}:`);
      lines.push(...block.text.split(/\r?\n/).map((line) => `> ${line}`), "");
    } else if (block.type === "details") {
      lines.push(...block.rows.map((row) => `${row.label}: ${row.value}`), "");
    }
  }
  if (content.cta) lines.push(`${content.cta.label}: ${content.cta.url}`, "");
  lines.push(t("common.signoff"), t("common.team", { brand }), "", "—", t("common.safety", { brand }));
  lines.push(t(content.audience === "account" ? "common.footerAccount" : "common.footerGuest", { brand }));
  lines.push(`${t("common.help")}: ${page("/help")}`);
  return lines.join("\n");
}
