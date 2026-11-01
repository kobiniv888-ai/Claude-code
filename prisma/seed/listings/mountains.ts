/** Demo listings in the ski resorts (Gudauri, Bakuriani). Kazbegi is in regions.ts. */
import type { ListingSeed } from "./types";

const SKI_RULES = {
  checkInFrom: "15:00",
  checkOutUntil: "11:00",
  smokingAllowed: false,
  petsAllowed: false,
  partiesAllowed: false,
  quietHoursFrom: "22:00",
  quietHoursTo: "08:00",
  contactHoursFrom: "09:00",
  contactHoursTo: "21:00",
};

export const MOUNTAIN_LISTINGS: ListingSeed[] = [
  {
    n: 19,
    owner: "rivka",
    status: "LIVE",
    days: 16,
    city: "gudauri",
    neighborhood: "center",
    lat: 42.4769,
    lng: 44.4811,
    address: "Demo address — Gudauri",
    originalLocale: "he",
    text: {
      he: {
        title: "שאלה מעץ בגודאורי ליד הרכבל – מטבח כשר ושבת מלאה",
        description:
          "שאלה מעץ בשתי קומות, חמש דקות הליכה מהרכבל הראשי, עם נוף פתוח לפסגות ולמסלולים. שלושה חדרי שינה, שני חדרי רחצה, סלון עם אח ומרפסת גדולה, וסאונה קטנה אחרי יום סקי. המטבח כשר, עם כלים נפרדים לבשר ולחלב, ויש פלטה, מיחם, שעוני שבת ומפתח רגיל – בלי חיישנים. מקום לאחסון ציוד סקי וחניה צמודה. מתאים למשפחה עם ילדים או לשתי משפחות קטנות. אנחנו שומרי שבת – פניות בשבת ובחג ייענו במוצאי שבת. הנחה לשבוע שלם.",
      },
      en: {
        title: "Wooden chalet in Gudauri near the lift – kosher kitchen and full Shabbat setup",
        description:
          "A two-storey wooden chalet, a five-minute walk from the main lift, with an open view of the peaks and the slopes. Three bedrooms, two bathrooms, a living room with a fireplace and a large balcony, plus a small sauna for after a day of skiing. The kitchen is kosher, with separate dishes for meat and dairy, and there is a hot plate, an urn, Shabbat timers and a regular key – no sensors. Storage for ski equipment and parking next to the house. Suits a family with children or two small families. We keep Shabbat – messages on Shabbat and holidays are answered afterwards. Discount for a full week.",
      },
      ru: {
        title: "Деревянное шале в Гудаури у подъёмника – кошерная кухня и всё для шаббата",
        description:
          "Двухэтажное деревянное шале в пяти минутах пешком от главного подъёмника, с открытым видом на вершины и трассы. Три спальни, две ванные, гостиная с камином и большой балкон, а также небольшая сауна после дня на лыжах. Кухня кошерная, с отдельной посудой для мясного и молочного, есть плата, термопот, таймеры для шаббата и обычный ключ – без датчиков. Место для хранения лыжного снаряжения и парковка у дома. Подойдёт семье с детьми или двум небольшим семьям. Мы соблюдаем шаббат – на сообщения в шаббат и праздники ответим после их окончания. Скидка за полную неделю.",
      },
      ar: {
        title: "شاليه خشبي في غوداوري قرب المصعد الجبلي – مطبخ كوشير وتجهيز كامل للسبت",
        description:
          "شاليه خشبي من طابقين على بعد خمس دقائق سيرًا من المصعد الجبلي الرئيسي، بإطلالة مفتوحة على القمم والمنحدرات. ثلاث غرف نوم وحمّامان وغرفة جلوس مع مدفأة وشرفة كبيرة، إضافة إلى ساونا صغيرة بعد يوم من التزلج. المطبخ كوشير، مع أوانٍ منفصلة للحوم والألبان، وتتوفر صفيحة تسخين وغلاية ومؤقتات للسبت ومفتاح عادي – بلا حساسات. مكان لتخزين معدات التزلج وموقف بجانب البيت. يناسب عائلة مع أطفال أو عائلتين صغيرتين. نحن نحفظ السبت – نرد على رسائل السبت والأعياد بعد انتهائها. خصم لأسبوع كامل.",
      },
      ka: {
        title: "ხის შალე გუდაურში საბაგიროსთან – კოშერული სამზარეულო და სრული შაბათი",
        description:
          "ორსართულიანი ხის შალე მთავარი საბაგიროდან ხუთი წუთის სავალზე, მწვერვალებისა და ტრასების ღია ხედით. სამი საძინებელი, ორი სააბაზანო, მისაღები ბუხრით და დიდი აივანი, ასევე პატარა საუნა თხილამურებით სრიალის შემდეგ. სამზარეულო კოშერულია, ხორცისა და რძის ცალკე ჭურჭლით, არის ფილა, წყლის ქვაბი, შაბათის ტაიმერები და ჩვეულებრივი გასაღები – სენსორების გარეშე. სათხილამურო აღჭურვილობის საცავი და ავტოსადგომი სახლთან. შესაფერისია ბავშვიანი ოჯახისთვის ან ორი პატარა ოჯახისთვის. შაბათს ვიცავთ – შაბათსა და დღესასწაულებზე მოსულ შეტყობინებებს მათი დასრულების შემდეგ ვპასუხობთ. ფასდაკლება სრულ კვირაზე.",
      },
    },
    photos: ["ch5", "ch3", "lv34", "bd20", "ch2"],
    fields: {
      dealType: "SHORT_STAY",
      propertyType: "COTTAGE",
      rooms: 4,
      bedrooms: 3,
      bathrooms: 2,
      bedsDouble: 2,
      bedsSingle: 2,
      bedsSofa: 1,
      maxGuests: 7,
      sizeSqm: 120,
      totalFloors: 2,
      yearBuilt: 2017,
      buildingAge: "NEW",
      furnished: true,
      condition: "NEWLY_RENOVATED",
      heating: ["ELECTRIC", "GAS_BOILER"],
      views: ["MOUNTAIN"],
      amenities: ["wifi", "heating", "washing_machine", "full_kitchen", "tv", "parking", "balcony_terrace", "sauna", "near_ski_lifts", "crib_high_chair"],
      kitchenKosher: "KOSHER",
      shabbatFeatures: ["hot_plate", "hot_water_urn", "light_timers", "mechanical_key", "stairs_or_shabbat_elevator", "no_motion_sensors"],
      jewishFeatures: ["mezuzot", "separable_beds", "host_keeps_shabbat", "host_speaks_hebrew"],
      price: 1100,
      currency: "ILS",
      pricePeriod: "NIGHT",
      deposit: 500,
      cleaningFee: 200,
      utilitiesIncluded: true,
      minStayNights: 3,
      weeklyDiscountPct: 10,
      ...SKI_RULES,
    },
    contact: { phone: true },
    booked: [
      { start: 54, nights: 7 },
      { start: 70, nights: 6 },
    ],
  },
  {
    n: 20,
    owner: "rivka",
    status: "LIVE",
    days: 30,
    city: "bakuriani",
    neighborhood: "center",
    lat: 41.7508,
    lng: 43.5296,
    address: "Demo address — Bakuriani",
    originalLocale: "he",
    text: {
      he: {
        title: "וילה למשפחה גדולה בבקוריאני (עד 10 אורחים) – מוכנה לשבת ולפסח",
        description:
          "וילת עץ ואבן בשלוש קומות על כר דשא רחב בבקוריאני, עשר דקות נסיעה מהמעליות של דידוולי וקוכטה. חמישה חדרי שינה ושלושה חדרי רחצה, סלון גדול עם אח, פינת אוכל ל-14 ומטבח כשר עם שני כיורים, שני תנורים ומקרר גדול. יש פלטה, מיחם, שעוני שבת, מפתח רגיל ומדרגות בלבד, והמטבח מוכשר לפסח לפי בקשה. בחצר מקום לסוכה, מגלשת שלג לילדים ומנגל. בקיץ זה בסיס מצוין לטיולים ביערות בורג׳ומי. מתאים למשפחות גדולות או לשתי משפחות יחד.",
      },
      en: {
        title: "Villa for a big family in Bakuriani (up to 10 guests) – ready for Shabbat and Pesach",
        description:
          "A three-storey wood-and-stone villa on a wide meadow in Bakuriani, ten minutes' drive from the Didveli and Kokhta lifts. Five bedrooms and three bathrooms, a large living room with a fireplace, a dining area for fourteen and a kosher kitchen with two sinks, two ovens and a big fridge. There is a hot plate, an urn, Shabbat timers, a regular key and stairs only, and the kitchen can be kashered for Pesach on request. The yard has room for a sukkah, a sledging slope for children and a barbecue. In summer it is a great base for hikes in the Borjomi forests. Suits big families or two families together.",
      },
      ru: {
        title: "Вилла для большой семьи в Бакуриани (до 10 гостей) – готова к шаббату и Песаху",
        description:
          "Трёхэтажная вилла из дерева и камня на широкой поляне в Бакуриани, в десяти минутах езды от подъёмников Дидвели и Кохта. Пять спален и три ванные, большая гостиная с камином, обеденная зона на четырнадцать человек и кошерная кухня с двумя раковинами, двумя духовками и большим холодильником. Есть плата, термопот, таймеры для шаббата, обычный ключ и только лестницы, а кухню по запросу откашеруют к Песаху. Во дворе место для сукки, горка для санок и мангал. Летом это отличная база для прогулок по боржомским лесам. Подойдёт большим семьям или двум семьям вместе.",
      },
      ar: {
        title: "فيلا لعائلة كبيرة في باكورياني (حتى 10 ضيوف) – جاهزة للسبت والفصح",
        description:
          "فيلا من الخشب والحجر من ثلاثة طوابق على مرج واسع في باكورياني، على بعد عشر دقائق بالسيارة من مصاعد ديدفيلي وكوختا. خمس غرف نوم وثلاثة حمّامات، وغرفة جلوس كبيرة مع مدفأة، وركن طعام لأربعة عشر شخصًا، ومطبخ كوشير بحوضين وفرنين وثلاجة كبيرة. تتوفر صفيحة تسخين وغلاية ومؤقتات للسبت ومفتاح عادي ودرج فقط، ويمكن تكشير المطبخ لعيد الفصح عند الطلب. في الفناء مكان لنصب سوكا ومنحدر للزلاجات للأطفال ومشواة. في الصيف هي قاعدة رائعة للتنزه في غابات بورجومي. تناسب العائلات الكبيرة أو عائلتين معًا.",
      },
      ka: {
        title: "ვილა დიდი ოჯახისთვის ბაკურიანში (10 სტუმრამდე) – მზადაა შაბათისა და პესახისთვის",
        description:
          "სამსართულიანი ხისა და ქვის ვილა ფართო მდელოზე ბაკურიანში, დიდველისა და კოხტას საბაგიროებიდან მანქანით ათ წუთში. ხუთი საძინებელი და სამი სააბაზანო, დიდი მისაღები ბუხრით, სასადილო ზონა თოთხმეტი ადამიანისთვის და კოშერული სამზარეულო ორი ნიჟარით, ორი ღუმელითა და დიდი მაცივრით. არის ფილა, წყლის ქვაბი, შაბათის ტაიმერები, ჩვეულებრივი გასაღები და მხოლოდ კიბეები, სამზარეულოს კი მოთხოვნისამებრ პესახისთვის დააკაშერებენ. ეზოში არის ადგილი სუქისთვის, ციგით სასრიალო ფერდობი ბავშვებისთვის და მაყალი. ზაფხულში ეს ბორჯომის ტყეებში სალაშქროდ შესანიშნავი ბაზაა. შესაფერისია დიდი ოჯახებისთვის ან ორი ოჯახისთვის ერთად.",
      },
    },
    photos: ["hx26", "hx19", "hx10", "lv18", "kt13", "hx14"],
    fields: {
      dealType: "SHORT_STAY",
      propertyType: "VILLA",
      rooms: 6,
      bedrooms: 5,
      bathrooms: 3,
      bedsDouble: 3,
      bedsSingle: 4,
      bedsSofa: 1,
      maxGuests: 10,
      sizeSqm: 260,
      totalFloors: 3,
      yearBuilt: 2019,
      buildingAge: "NEW",
      furnished: true,
      condition: "NEWLY_RENOVATED",
      heating: ["CENTRAL", "GAS_BOILER"],
      views: ["MOUNTAIN"],
      amenities: [
        "wifi", "heating", "washing_machine", "dryer", "dishwasher", "full_kitchen", "tv", "parking", "yard", "balcony_terrace", "sauna", "near_ski_lifts", "crib_high_chair",
      ],
      kitchenKosher: "KOSHER",
      shabbatFeatures: ["hot_plate", "hot_water_urn", "light_timers", "mechanical_key", "stairs_or_shabbat_elevator", "no_motion_sensors"],
      jewishFeatures: ["mezuzot", "separable_beds", "sukkah_space", "pesach_ready", "host_keeps_shabbat", "host_speaks_hebrew"],
      price: 1900,
      currency: "ILS",
      pricePeriod: "NIGHT",
      deposit: 1000,
      cleaningFee: 350,
      utilitiesIncluded: true,
      minStayNights: 3,
      weeklyDiscountPct: 12,
      ...SKI_RULES,
    },
    contact: { phone: true },
    booked: [{ start: 35, nights: 6 }],
  },
];
