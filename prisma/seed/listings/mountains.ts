/** Demo listings in the ski resorts (Gudauri, Bakuriani). */
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
    photos: ["ch5", "ch3", "lv34", "bd20", "ch2", "ch7"],
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
    photos: ["hx26", "hx19", "hx10", "lv18", "kt13", "hx14", "ch14"],
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
  {
    n: 21,
    owner: "rivka",
    status: "LIVE",
    days: 11,
    city: "bakuriani",
    neighborhood: "didveli",
    lat: 41.7381,
    lng: 43.5192,
    address: "Demo address — Didveli, Bakuriani",
    originalLocale: "he",
    text: {
      he: {
        title: "בקתת A-frame זוגית ליד המעלית של דידוולי בבקוריאני",
        description:
          "בקתת עץ משולשת וחמימה בין עצי האורן, כמה דקות הליכה מהמעלית של דידוולי – אפשר לצאת לגלוש ישר מהדלת. בקומה התחתונה סלון עם קמין חשמלי, מטבחון עם פלטה ושולחן לארבעה, ובקומת הגלריה חדר שינה עם מיטה זוגית ושתי מיטות יחיד. חלון ענק פונה אל ההרים, ויש מרפסת עץ לכוס קפה בבוקר. מפתח רגיל ובלי חיישנים, כך שגם שבת כאן פשוטה. מתאים לזוג או למשפחה קטנה. בקיץ השקט מושלם לטיולים, לקטיף פטל ולרכיבה על סוסים.",
      },
      en: {
        title: "Cosy A-frame cabin by the Didveli lift in Bakuriani",
        description:
          "A warm triangular wooden cabin among the pine trees, a few minutes' walk from the Didveli lift – you can head out to ski straight from the door. Downstairs there is a living room with an electric fireplace, a kitchenette with a hot plate and a table for four; upstairs, the loft bedroom has a double bed and two single beds. A huge window faces the mountains, and there is a wooden deck for your morning coffee. A regular key and no sensors, so Shabbat here is simple too. Suits a couple or a small family. In summer the quiet is perfect for hiking, picking raspberries and horse riding.",
      },
      ru: {
        title: "Уютный домик A-frame у подъёмника Дидвели в Бакуриани",
        description:
          "Тёплый треугольный деревянный домик среди сосен, в нескольких минутах пешком от подъёмника Дидвели – на лыжи можно вставать прямо у двери. Внизу гостиная с электрокамином, мини-кухня с платой и стол на четверых, наверху на антресоли спальня с двуспальной и двумя односпальными кроватями. Огромное окно выходит на горы, а на деревянной террасе приятно пить утренний кофе. Обычный ключ и никаких датчиков, так что и шаббат здесь проводить просто. Подойдёт паре или небольшой семье. Летом здесь тихо – идеально для походов, сбора малины и конных прогулок.",
      },
      ar: {
        title: "كوخ A-frame مريح قرب مصعد ديدفيلي في باكورياني",
        description:
          "كوخ خشبي مثلث ودافئ بين أشجار الصنوبر، على بعد دقائق سيرًا من مصعد ديدفيلي – يمكنك الانطلاق للتزلج من الباب مباشرة. في الطابق السفلي غرفة جلوس مع مدفأة كهربائية ومطبخ صغير فيه صفيحة تسخين وطاولة لأربعة، وفي الطابق العلوي غرفة نوم بسرير مزدوج وسريرين مفردين. نافذة ضخمة تطل على الجبال، وشرفة خشبية لقهوة الصباح. مفتاح عادي ولا حساسات، فيكون السبت هنا بسيطًا أيضًا. يناسب زوجين أو عائلة صغيرة. في الصيف يجعل الهدوء المكان مثاليًا للمشي وقطف التوت وركوب الخيل.",
      },
      ka: {
        title: "მყუდრო A-frame სახლი დიდველის საბაგიროსთან ბაკურიანში",
        description:
          "თბილი სამკუთხა ხის სახლი ფიჭვებს შორის, დიდველის საბაგიროდან რამდენიმე წუთის სავალზე – სასრიალოდ პირდაპირ კარიდან გახვალთ. ქვედა სართულზე მისაღებია ელექტრო ბუხრით, პატარა სამზარეულო ფილით და მაგიდა ოთხი ადამიანისთვის, ზედა სართულზე კი საძინებელი ორადგილიანი და ორი ერთადგილიანი საწოლით. უზარმაზარი ფანჯარა მთებს გადაჰყურებს, ხის ტერასაზე კი დილის ყავის დალევაა სასიამოვნო. ჩვეულებრივი გასაღები და არანაირი სენსორი, ასე რომ შაბათის გატარებაც აქ მარტივია. შესაფერისია წყვილისთვის ან პატარა ოჯახისთვის. ზაფხულში სიმშვიდე იდეალურია ლაშქრობისთვის, ჟოლოს კრეფისა და ცხენით სეირნობისთვის.",
      },
    },
    photos: ["ch6", "ch10", "ch1", "ch9", "ch4", "bd14"],
    fields: {
      dealType: "SHORT_STAY",
      propertyType: "COTTAGE",
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      bedsDouble: 1,
      bedsSingle: 2,
      maxGuests: 4,
      sizeSqm: 65,
      totalFloors: 2,
      yearBuilt: 2021,
      buildingAge: "NEW",
      furnished: true,
      condition: "NEWLY_RENOVATED",
      heating: ["ELECTRIC"],
      views: ["MOUNTAIN"],
      amenities: ["wifi", "heating", "full_kitchen", "tv", "parking", "balcony_terrace", "near_ski_lifts"],
      kitchenKosher: "CAN_KASHER",
      shabbatFeatures: ["hot_plate", "mechanical_key", "no_motion_sensors"],
      jewishFeatures: ["separable_beds", "host_keeps_shabbat", "host_speaks_hebrew"],
      price: 450,
      currency: "ILS",
      pricePeriod: "NIGHT",
      cleaningFee: 100,
      utilitiesIncluded: true,
      minStayNights: 2,
      weeklyDiscountPct: 10,
      ...SKI_RULES,
    },
    contact: { phone: true },
    booked: [{ start: 60, nights: 5 }],
  },
  {
    n: 22,
    owner: "rivka",
    status: "LIVE",
    days: 36,
    city: "gudauri",
    neighborhood: "new-gudauri",
    lat: 42.4614,
    lng: 44.4738,
    address: "Demo address — New Gudauri",
    originalLocale: "he",
    text: {
      he: {
        title: "דירת סקי למכירה בגודאורי החדשה, ליד המעלית – מניבה בהשכרה",
        description:
          "למכירה דירת שני חדרים מרוהטת של 48 מ״ר בקומה הרביעית במתחם הוותיק של גודאורי החדשה, כמה מטרים מהמעלית ומבתי הקפה. סלון עם מטבח פתוח ומרפסת לנוף ההרים, חדר שינה עם מיטה זוגית ופינת שינה לילדים עם מיטת קומתיים. במתחם יש סאונה, חדר כושר, אחסון לציוד סקי וקבלה פעילה בחורף. אנחנו משכירים את הדירה בעונה לנופשים, ויש לנו נתוני תפוסה והכנסות שנשמח לשלוח. מתאים כנכס להשקעה או כבית חופשה למשפחה. נמכרת עם כל הריהוט והציוד.",
      },
      en: {
        title: "Ski apartment for sale in New Gudauri by the lift – rents well",
        description:
          "For sale: a furnished 48 m² two-room apartment on the fourth floor of an established complex in New Gudauri, a few metres from the lift and the cafés. A living room with an open kitchen and a balcony with a mountain view, a bedroom with a double bed and a children's corner with a bunk bed. The complex has a sauna, a gym, ski storage and a reception that runs all winter. We rent the apartment to holidaymakers in the season and are happy to share occupancy and income figures. Suits an investment or a family holiday home. Sold with all the furniture and equipment.",
      },
      ru: {
        title: "Лыжная квартира на продажу в Новом Гудаури у подъёмника – приносит доход",
        description:
          "Продаётся меблированная двухкомнатная квартира 48 м² на четвёртом этаже в обжитом комплексе Нового Гудаури, в нескольких метрах от подъёмника и кафе. Гостиная с открытой кухней и балконом с видом на горы, спальня с двуспальной кроватью и детский уголок с двухъярусной кроватью. В комплексе сауна, спортзал, хранение лыж и ресепшен, работающий всю зиму. В сезон мы сдаём квартиру отдыхающим и с радостью поделимся данными о загрузке и доходе. Подойдёт для инвестиций или как семейный дом для отдыха. Продаётся со всей мебелью и техникой.",
      },
      ar: {
        title: "شقة تزلج للبيع في غوداوري الجديدة قرب المصعد – مربحة في التأجير",
        description:
          "للبيع شقة مفروشة من غرفتين بمساحة 48 م² في الطابق الرابع من مجمّع قائم في غوداوري الجديدة، على بعد أمتار من المصعد والمقاهي. غرفة جلوس مع مطبخ مفتوح وشرفة بإطلالة على الجبال، وغرفة نوم بسرير مزدوج، وركن للأطفال بسرير بطابقين. في المجمّع ساونا وصالة رياضية ومخزن لمعدات التزلج واستقبال يعمل طوال الشتاء. نؤجر الشقة للمصطافين في الموسم، ويسعدنا مشاركة أرقام الإشغال والدخل. تناسب الاستثمار أو بيت عطلات للعائلة. تُباع مع كل الأثاث والتجهيزات.",
      },
      ka: {
        title: "სათხილამურო ბინა იყიდება ახალ გუდაურში საბაგიროსთან – კარგ შემოსავალს იძლევა",
        description:
          "იყიდება ავეჯით აღჭურვილი ოროთახიანი, 48 მ² ბინა მეოთხე სართულზე ახალი გუდაურის დასახლებულ კომპლექსში, საბაგიროდან და კაფეებიდან რამდენიმე მეტრში. მისაღები ღია სამზარეულოთი და აივნით მთის ხედით, საძინებელი ორადგილიანი საწოლით და საბავშვო კუთხე ორსართულიანი საწოლით. კომპლექსში არის საუნა, სპორტული დარბაზი, თხილამურების საცავი და მიმღები, რომელიც მთელი ზამთარი მუშაობს. სეზონზე ბინას დამსვენებლებზე ვაქირავებთ და სიამოვნებით გაგიზიარებთ დატვირთვისა და შემოსავლის მონაცემებს. შესაფერისია ინვესტიციისთვის ან საოჯახო დასასვენებელ სახლად. იყიდება მთელი ავეჯითა და ტექნიკით.",
      },
    },
    photos: ["ch12", "ch11", "ch13", "ch8", "bd16", "bd22"],
    fields: {
      dealType: "SALE",
      propertyType: "APARTMENT",
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      bedsDouble: 1,
      bedsSingle: 2,
      maxGuests: 4,
      sizeSqm: 48,
      floor: 4,
      totalFloors: 9,
      elevator: true,
      yearBuilt: 2014,
      buildingAge: "NEW",
      furnished: true,
      condition: "NEWLY_RENOVATED",
      heating: ["ELECTRIC", "CENTRAL"],
      views: ["MOUNTAIN"],
      amenities: ["wifi", "heating", "washing_machine", "full_kitchen", "tv", "balcony_terrace", "sauna", "gym", "near_ski_lifts"],
      kitchenKosher: "CAN_KASHER",
      shabbatFeatures: ["mechanical_key"],
      jewishFeatures: ["host_keeps_shabbat", "host_speaks_hebrew"],
      price: 72000,
      currency: "USD",
      pricePeriod: "TOTAL",
      contactHoursFrom: "09:00",
      contactHoursTo: "21:00",
    },
    contact: { phone: true },
  },
];
