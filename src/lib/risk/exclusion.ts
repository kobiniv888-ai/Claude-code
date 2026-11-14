/**
 * Exclusionary listing text (SECURITY_REPORT 14.5.e): "no Arabs", "Jews only", "не сдаём
 * кавказцам"… — excluding guests by religion, nationality or ethnicity. Pure and client-safe.
 *
 * The Terms' fair-housing section forbids it, but a person decides: a hit never blocks, it sends
 * the listing to the admin's review (risk reason "exclusionary_text", src/lib/risk/index.ts).
 * Stating what a place offers ("kosher kitchen", "near the synagogue", "suits religious families",
 * "Hebrew-speaking host") is not exclusion and never matches.
 *
 *   detectExclusionaryText("Apartment for Jews only")   → ["jews only"]
 *   detectExclusionaryText("Kosher kitchen, Shabbat elevator") → []
 */
import { compilePattern } from "./phrases";
import { normalizeSearchText } from "@/lib/search-text";

/** Groups of people by religion, nationality or ethnicity, per language (the plural forms only). */
const EN_GROUPS =
  "(arabs|jews|muslims|christians|israelis|russians|georgians|ukrainians|armenians|azerbaijanis|azeris|turks|iranians|persians|indians|pakistanis|africans|blacks|chinese|foreigners|gypsies|kurds|chechens|caucasians)";
/** "no Arab guests", "not for Jewish families": an adjective with a word for people. */
const EN_ADJECTIVES =
  "(arab|jewish|muslim|christian|israeli|russian|georgian|ukrainian|armenian|azerbaijani|turkish|iranian|indian|pakistani|african|black|chinese|foreign|gypsy|roma|kurdish|chechen|caucasian)";
const EN_PEOPLE = "(guests|people|tenants|families|clients|visitors|renters|customers|men|women|couples)";
const HE_GROUPS =
  "(ערבים|לערבים|יהודים|ליהודים|מוסלמים|למוסלמים|נוצרים|לנוצרים|ישראלים|לישראלים|רוסים|לרוסים|גאורגים|לגאורגים|זרים|לזרים|אפריקאים|לאפריקאים|הודים|להודים|טורקים|לטורקים|איראנים|לאיראנים|דתיים|לדתיים|חילונים|לחילונים|חרדים|לחרדים)";
const RU_GROUPS =
  "(арабов|арабам|арабы|евреев|евреям|евреи|иудеев|мусульман|мусульманам|мусульмане|христиан|христианам|израильтян|израильтянам|израильтяне|русских|русским|грузин|грузинам|украинцев|украинцам|армян|армянам|азербайджанцев|азербайджанцам|азеров|азерам|турков|туркам|иранцев|иранцам|индусов|индусам|индийцев|пакистанцев|африканцев|африканцам|негров|неграм|темнокожих|китайцев|китайцам|иностранцев|иностранцам|иностранцы|цыган|цыганам|цыгане|курдов|чеченцев|чеченцам|кавказцев|кавказцам|кавказцы|нерусских|нерусским|славян|славянам)";
const AR_GROUPS =
  "(العرب|عرب|للعرب|اليهود|يهود|لليهود|المسلمين|مسلمين|للمسلمين|المسيحيين|مسيحيين|للمسيحيين|الاسرائيليين|اسرائيليين|للاسرائيليين|الروس|للروس|الاجانب|للاجانب|الهنود|للهنود|الافارقه|للافارقه|الاتراك|للاتراك|الايرانيين|للايرانيين)";
/** Georgian: the plural in the dative ("…ებს": to Arabs) and the nominative ("…ები"). */
const KA_GROUPS =
  "(არაბებს|ებრაელებს|მუსლიმებს|ქრისტიანებს|ისრაელელებს|რუსებს|ქართველებს|უკრაინელებს|სომხებს|აზერბაიჯანელებს|თურქებს|ირანელებს|ინდოელებს|უცხოელებს|ბოშებს|ქურთებს|ჩეჩნებს|არაბები|ებრაელები|მუსლიმები|ისრაელელები|რუსები|უცხოელები|ბოშები)";

const PATTERNS: string[] = [
  // English: "no Arabs", "not for Jews", "Jews only", "only for Israelis", "we don't rent to Russians"
  `(no|not for|not to|not suitable for|forbidden for|banned|without) ${EN_GROUPS}`,
  `(no|not for|not to|only|only for) ${EN_ADJECTIVES} ${EN_PEOPLE}`,
  `${EN_ADJECTIVES} ${EN_PEOPLE} only`,
  `${EN_GROUPS} (only|not allowed|not welcome|not accepted|need not apply|are not allowed|are not welcome|are not accepted)`,
  `(only for|for only|only to|rent only to|rented only to|open only to|accepting only|accept only) ${EN_GROUPS}`,
  `(dont|do not|we dont|we do not|wont|will not|we wont|we will not|never) (rent|rent out|host|accept|take|let) (to|) ${EN_GROUPS}`,
  // Hebrew: "לא לערבים", "ללא ערבים", "בלי ערבים", "ליהודים בלבד", "רק ליהודים", "לא משכירים לערבים"
  `(לא|ללא|בלי|אסור|אין כניסה|אין כניסה ל|לא מתאים|לא מתאים ל) ${HE_GROUPS}`,
  `${HE_GROUPS} (בלבד|לא יתקבלו|לא מתקבלים|אינם מתקבלים|לא רצויים)`,
  `(רק|אך ורק|מיועד רק|מיועדת רק|מושכר רק|מושכרת רק) ${HE_GROUPS}`,
  `(לא|אנחנו לא|אנו לא|איננו) (משכירים|משכיר|משכירה|מארחים|מקבלים) ${HE_GROUPS}`,
  // Russian: "без арабов", "только для евреев", "не для кавказцев", "не сдаём кавказцам", "славянам"
  `(без|не для|кроме|запрещено|запрещен|запрещена) ${RU_GROUPS}`,
  `(только для|только|исключительно для|сдаю только|сдаем только|сдается только) ${RU_GROUPS}`,
  `(не сдаю|не сдаем|не сдается|не принимаем|не селим|не заселяем) ${RU_GROUPS}`,
  `${RU_GROUPS} (не беспокоить|просьба не беспокоить|не звонить|не обращаться)`,
  // Arabic: "ممنوع اليهود", "لا لليهود", "للمسلمين فقط", "غير مسموح للأجانب"
  `(لا|ممنوع|يمنع|غير مسموح|غير مسموح ل) ${AR_GROUPS}`,
  `${AR_GROUPS} (فقط|ممنوعين|غير مرحب بهم)`,
  `(فقط|حصرا|حصريا) ${AR_GROUPS}`,
  `(لا نؤجر|لا نستقبل|لا نقبل|لن نؤجر) ${AR_GROUPS}`,
  // Georgian: "არა არაბებს", "მხოლოდ ებრაელებს", "უცხოელებს არ ვაქირავებთ"
  `(არა|აკრძალულია) ${KA_GROUPS}`,
  `(მხოლოდ|მარტო) ${KA_GROUPS}`,
  `${KA_GROUPS} (არ ვაქირავებ*|არ ვიღებ*|არ მიიღება|აკრძალულია)`,
];

const COMPILED = PATTERNS.map(compilePattern);

/** The exclusionary phrases found (normalized), at most 5. */
export function detectExclusionaryText(text: string | null | undefined): string[] {
  const words = normalizeSearchText(text);
  if (!words) return [];
  const haystack = ` ${words} `;
  const found: string[] = [];
  for (const pattern of COMPILED) {
    const match = pattern.exec(haystack);
    if (match && !found.includes(match[0].trim())) found.push(match[0].trim().slice(0, 80));
    if (found.length >= 5) break;
  }
  return found;
}
