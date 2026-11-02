/** Demo listings outside the big cities (Kobuleti, Kazbegi, Sighnaghi). Texts by hand in 5 languages. */
import type { ListingSeed } from "./types";

const STAY_RULES = {
  checkInFrom: "14:00",
  checkOutUntil: "11:00",
  smokingAllowed: false,
  petsAllowed: false,
  partiesAllowed: false,
  quietHoursFrom: "22:00",
  quietHoursTo: "08:00",
  contactHoursFrom: "09:00",
  contactHoursTo: "21:00",
};

export const REGION_LISTINGS: ListingSeed[] = [
  {
    n: 15,
    owner: "michael",
    status: "LIVE",
    days: 6,
    city: "kobuleti",
    neighborhood: "center",
    lat: 41.8197,
    lng: 41.7768,
    address: "Demo address — Center, Kobuleti",
    originalLocale: "he",
    text: {
      he: {
        title: "דירת שני חדרים בקובולטי, שתי דקות מהים – להשכרה חודשית",
        description:
          "דירה מרוהטת בבניין חדש, שתי דקות הליכה מחוף הים ומהטיילת של קובולטי. סלון מואר עם מרפסת, חדר שינה עם מיטה זוגית ומטבח מלא עם מדיח כלים. מתאימה לזוג או למשפחה קטנה שרוצים חודש או יותר ליד הים, הרחק מהעומס של בטומי. החשבונות לא כלולים – בערך 40 דולר בחודש בחורף. בבניין יש מעלית וחנייה בחצר. סופרמרקט, בית מרקחת ותחנת האוטובוס לבטומי נמצאים ממש מעבר לפינה, ובמטבח יש פלטה לשבת.",
      },
      en: {
        title: "2-room flat in Kobuleti, two minutes from the sea – monthly rent",
        description:
          "A furnished apartment in a new building, a two-minute walk from Kobuleti's beach and seafront promenade. A bright living room with a balcony, a bedroom with a double bed and a full kitchen with a dishwasher. Good for a couple or a small family who want a month or more by the sea, away from the bustle of Batumi. Utilities are not included – about $40 a month in winter. The building has a lift and parking in the yard. A supermarket, a pharmacy and the bus stop to Batumi are right around the corner, and there is a hot plate for Shabbat in the kitchen.",
      },
      ru: {
        title: "Двухкомнатная квартира в Кобулети, в двух минутах от моря – помесячно",
        description:
          "Меблированная квартира в новом доме, в двух минутах ходьбы от пляжа и набережной Кобулети. Светлая гостиная с балконом, спальня с двуспальной кроватью и полностью оборудованная кухня с посудомоечной машиной. Подойдёт паре или небольшой семье, которые хотят провести месяц или больше у моря, вдали от суеты Батуми. Коммунальные услуги не включены – зимой около 40 долларов в месяц. В доме есть лифт и парковка во дворе. Супермаркет, аптека и остановка автобуса до Батуми – сразу за углом, а на кухне есть плита для подогрева на Шаббат.",
      },
      ar: {
        title: "شقة من غرفتين في كوبوليتي، على بُعد دقيقتين من البحر – إيجار شهري",
        description:
          "شقة مفروشة في مبنى جديد، على بُعد دقيقتين سيرًا من شاطئ كوبوليتي وكورنيشها. صالة مشرقة مع شرفة، وغرفة نوم بسرير مزدوج، ومطبخ كامل مع غسالة صحون. مناسبة لزوجين أو لعائلة صغيرة يريدون قضاء شهر أو أكثر قرب البحر بعيدًا عن زحمة باتومي. الفواتير غير مشمولة – نحو 40 دولارًا في الشهر في الشتاء. في المبنى مصعد وموقف سيارات في الفناء. السوبرماركت والصيدلية وموقف الحافلات إلى باتومي على بُعد خطوات، وفي المطبخ سخّان طعام للسبت.",
      },
      ka: {
        title: "ოროთახიანი ბინა ქობულეთში, ზღვიდან ორ წუთში – თვიური ქირით",
        description:
          "ავეჯით აღჭურვილი ბინა ახალ კორპუსში, ქობულეთის პლაჟიდან და ბულვარიდან ორი წუთის სავალზე. ნათელი მისაღები აივნით, საძინებელი ორადგილიანი საწოლით და სრულად აღჭურვილი სამზარეულო ჭურჭლის სარეცხი მანქანით. შესაფერისია წყვილისთვის ან პატარა ოჯახისთვის, ვისაც ზღვასთან ერთი თვე ან მეტი სურს, ბათუმის ხმაურისგან მოშორებით. კომუნალურები ფასში არ შედის – ზამთარში დაახლოებით 40 დოლარი თვეში. კორპუსში არის ლიფტი და პარკინგი ეზოში. სუპერმარკეტი, აფთიაქი და ბათუმის ავტობუსის გაჩერება სულ ახლოსაა, სამზარეულოში კი შაბათისთვის გამაცხელებელი ფილა დგას.",
      },
    },
    photos: ["ax9", "lv31", "lv35", "bd27", "kt10"],
    fields: {
      dealType: "MONTHLY_RENT",
      propertyType: "APARTMENT",
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      bedsDouble: 1,
      maxGuests: 3,
      sizeSqm: 52,
      floor: 4,
      totalFloors: 9,
      elevator: true,
      yearBuilt: 2021,
      buildingAge: "NEW",
      furnished: true,
      condition: "NEWLY_RENOVATED",
      heating: ["AIR_CONDITIONING"],
      views: ["CITY"],
      amenities: ["wifi", "air_conditioning", "washing_machine", "dishwasher", "full_kitchen", "balcony_terrace", "near_sea"],
      kitchenKosher: "CAN_KASHER",
      shabbatFeatures: ["hot_plate", "stairs_or_shabbat_elevator"],
      jewishFeatures: ["separable_beds", "host_speaks_hebrew"],
      price: 550,
      currency: "USD",
      pricePeriod: "MONTH",
      deposit: 550,
      utilitiesIncluded: false,
      utilitiesEstimate: 40,
      minStayNights: 30,
      smokingAllowed: false,
      petsAllowed: false,
      partiesAllowed: false,
      contactHoursFrom: "09:00",
      contactHoursTo: "21:00",
    },
    contact: { telegram: "@bayit_demo_michael" },
  },
  {
    n: 21,
    owner: "rivka",
    status: "LIVE",
    days: 11,
    city: "kazbegi",
    neighborhood: "center",
    lat: 42.6612,
    lng: 44.6391,
    address: "Demo address — Stepantsminda, Kazbegi",
    originalLocale: "he",
    text: {
      he: {
        title: "בקתת עץ בקזבגי עם נוף להר קזבק – מוכנה לשבת",
        description:
          "בקתה חמימה לזוג או למשפחה קטנה בסטפנצמינדה, עשר דקות הליכה מהמרכז. מהמרפסת רואים את הר קזבק ואת כנסיית גרגטי. חדר שינה עם מיטה זוגית, ספה נפתחת בסלון ומטבח מאובזר שאפשר להכשיר, עם פלטה, מיחם ומפתח רגיל לשבת. אנחנו שומרי שבת ומדברים עברית, ונשמח לעזור לתכנן טיולים בהרים. חנייה חינם ליד הבית. בחורף הבית מחומם היטב ויש עצים לאח. בקיץ אפשר לשבת בחצר ולצאת ממנה ישר לשבילי ההליכה.",
      },
      en: {
        title: "Wooden cottage in Kazbegi with a view of Mount Kazbek – ready for Shabbat",
        description:
          "A warm cottage for a couple or a small family in Stepantsminda, a ten-minute walk from the centre. From the terrace you see Mount Kazbek and the Gergeti church. One bedroom with a double bed, a sofa bed in the living room and a full kitchen that can be kashered, with a hot plate, a hot-water urn and an ordinary key for Shabbat. We keep Shabbat and speak Hebrew, and we're happy to help you plan trips in the mountains. Free parking by the house. In winter the house is well heated, and there is firewood for the fireplace. In summer you can sit in the yard and walk straight out onto the hiking trails.",
      },
      ru: {
        title: "Деревянный домик в Казбеги с видом на гору Казбек – готов к Шаббату",
        description:
          "Тёплый домик для пары или небольшой семьи в Степанцминде, в десяти минутах ходьбы от центра. С террасы видны гора Казбек и церковь Гергети. Спальня с двуспальной кроватью, диван-кровать в гостиной и оборудованная кухня, которую можно откашеровать; для Шаббата есть плита для подогрева, термопот и обычный ключ. Мы соблюдаем Шаббат и говорим на иврите – с радостью поможем спланировать прогулки в горах. Бесплатная парковка у дома. Зимой в доме тепло, для камина есть дрова. Летом можно посидеть во дворе и прямо оттуда выйти на пешие тропы.",
      },
      ar: {
        title: "كوخ خشبي في كازبيجي بإطلالة على جبل كازبيك – جاهز للسبت",
        description:
          "كوخ دافئ لزوجين أو لعائلة صغيرة في ستيبانتسميندا، على بُعد عشر دقائق سيرًا من المركز. من الشرفة ترون جبل كازبيك وكنيسة غيرغيتي. غرفة نوم بسرير مزدوج، وأريكة تتحول إلى سرير في الصالة، ومطبخ مجهّز يمكن تكشيره، مع سخّان طعام وغلاية ماء ومفتاح عادي للسبت. نحن نحافظ على السبت ونتحدث العبرية، ويسعدنا أن نساعدكم في التخطيط لرحلات في الجبال. موقف مجاني بجانب البيت. في الشتاء البيت دافئ جيدًا وهناك حطب للمدفأة. وفي الصيف يمكن الجلوس في الفناء والانطلاق منه مباشرة إلى مسارات المشي.",
      },
      ka: {
        title: "ხის კოტეჯი ყაზბეგში მყინვარწვერის ხედით – მზადაა შაბათისთვის",
        description:
          "თბილი კოტეჯი წყვილისთვის ან პატარა ოჯახისთვის სტეფანწმინდაში, ცენტრიდან ათი წუთის სავალზე. ტერასიდან ჩანს მყინვარწვერი და გერგეტის ეკლესია. საძინებელი ორადგილიანი საწოლით, გასაშლელი დივანი მისაღებში და აღჭურვილი სამზარეულო, რომლის კაშერიზაციაც შეიძლება; შაბათისთვის არის გამაცხელებელი ფილა, წყლის ქვაბი და ჩვეულებრივი გასაღები. ჩვენ ვიცავთ შაბათს და ვლაპარაკობთ ებრაულად – სიამოვნებით დაგეხმარებით მთაში სეირნობის დაგეგმვაში. უფასო პარკინგი სახლთან. ზამთარში სახლი კარგად თბება და ბუხრისთვის შეშაც არის. ზაფხულში ეზოში დაჯდებით და იქიდანვე პირდაპირ სალაშქრო ბილიკებზე გახვალთ.",
      },
    },
    photos: ["ch4", "bd14", "bd16", "lv6", "kt6"],
    fields: {
      dealType: "SHORT_STAY",
      propertyType: "COTTAGE",
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      bedsDouble: 1,
      bedsSofa: 1,
      maxGuests: 4,
      sizeSqm: 55,
      totalFloors: 1,
      yearBuilt: 2019,
      buildingAge: "NEW",
      furnished: true,
      condition: "NEWLY_RENOVATED",
      heating: ["ELECTRIC"],
      views: ["MOUNTAIN"],
      amenities: ["wifi", "heating", "full_kitchen", "parking", "balcony_terrace", "yard"],
      kitchenKosher: "CAN_KASHER",
      shabbatFeatures: ["hot_plate", "hot_water_urn", "mechanical_key"],
      jewishFeatures: ["separable_beds", "host_keeps_shabbat", "host_speaks_hebrew"],
      price: 420,
      currency: "ILS",
      pricePeriod: "NIGHT",
      cleaningFee: 80,
      utilitiesIncluded: true,
      minStayNights: 2,
      ...STAY_RULES,
    },
    contact: { phone: true },
    booked: [{ start: 20, nights: 3 }],
  },
  {
    n: 25,
    owner: "natela",
    status: "LIVE",
    days: 4,
    city: "sighnaghi",
    neighborhood: "center",
    lat: 41.6189,
    lng: 45.9246,
    address: "Demo address — Center, Sighnaghi",
    originalLocale: "ka",
    ownerVerified: true,
    text: {
      ka: {
        title: "მყუდრო ბინა აივნით სიღნაღის ძველ სახლში",
        description:
          "ნათელი ბინა ძველი სახლის ზედა სართულზე, სიღნაღის ცენტრიდან ხუთი წუთის სავალზე. აივნიდან ალაზნის ველი და კავკასიონის მთები ჩანს. საძინებელი ორადგილიანი საწოლით, მისაღები გასაშლელი დივნით და აღჭურვილი სამზარეულო. ცოტა ებრაულიც ვიცი და სიამოვნებით გირჩევთ, სად იყიდოთ ახალი ხილი და ბოსტნეული. მანქანის დაყენება სახლის წინ შეიძლება. ბინაში არის კონდიციონერი და სწრაფი ინტერნეტი. ახლოსაა ქალაქის გალავანი, პატარა კაფეები და ღვინის მარნები, საიდანაც საღამოს ულამაზესი მზის ჩასვლა ჩანს.",
      },
      he: {
        title: "דירה נעימה עם מרפסת בבית ישן בסיגנאגי",
        description:
          "דירה מוארת בקומה העליונה של בית ישן, חמש דקות הליכה ממרכז סיגנאגי. מהמרפסת רואים את עמק אלזני ואת הרי הקווקז. חדר שינה עם מיטה זוגית, סלון עם ספה נפתחת ומטבח מאובזר. אני מדברת קצת עברית ואשמח להמליץ איפה לקנות פירות וירקות טריים. אפשר להחנות את הרכב מול הבית. בדירה יש מזגן ואינטרנט מהיר. בקרבת מקום נמצאות חומת העיר, בתי קפה קטנים ויקבים, ומשם רואים בערב שקיעה יפהפייה.",
      },
      en: {
        title: "Cosy apartment with a balcony in an old house in Sighnaghi",
        description:
          "A bright apartment on the upper floor of an old house, a five-minute walk from the centre of Sighnaghi. From the balcony you see the Alazani valley and the Caucasus mountains. A bedroom with a double bed, a living room with a sofa bed and an equipped kitchen. I speak a little Hebrew and I'm happy to tell you where to buy fresh fruit and vegetables. You can park your car in front of the house. The apartment has air conditioning and fast internet. The town wall, small cafés and wine cellars are close by, and in the evening you can watch a beautiful sunset from there.",
      },
      ru: {
        title: "Уютная квартира с балконом в старом доме в Сигнахи",
        description:
          "Светлая квартира на верхнем этаже старого дома, в пяти минутах ходьбы от центра Сигнахи. С балкона видны Алазанская долина и горы Кавказа. Спальня с двуспальной кроватью, гостиная с диваном-кроватью и оборудованная кухня. Я немного говорю на иврите и с радостью подскажу, где купить свежие фрукты и овощи. Машину можно оставить перед домом. В квартире есть кондиционер и быстрый интернет. Рядом городская стена, маленькие кафе и винные погреба, откуда вечером виден красивый закат.",
      },
      ar: {
        title: "شقة مريحة بشرفة في بيت قديم في سيغناغي",
        description:
          "شقة مشرقة في الطابق العلوي من بيت قديم، على بُعد خمس دقائق سيرًا من مركز سيغناغي. من الشرفة ترون وادي ألازاني وجبال القوقاز. غرفة نوم بسرير مزدوج، وصالة بأريكة تتحول إلى سرير، ومطبخ مجهّز. أتحدث العبرية قليلًا ويسعدني أن أنصحكم بمكان شراء الفواكه والخضار الطازجة. يمكن ركن السيارة أمام البيت. في الشقة مكيّف وإنترنت سريع. وعلى مقربة سور المدينة ومقاهٍ صغيرة وأقبية نبيذ، ومن هناك يمكن مشاهدة غروب جميل في المساء.",
      },
    },
    photos: ["lv28", "lv2", "lv38", "bd17", "kt5"],
    fields: {
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      rooms: 2,
      bedrooms: 1,
      bathrooms: 1,
      bedsDouble: 1,
      bedsSofa: 1,
      maxGuests: 4,
      sizeSqm: 50,
      floor: 2,
      totalFloors: 2,
      elevator: false,
      yearBuilt: 1910,
      buildingAge: "OLD",
      furnished: true,
      condition: "OLD_RENOVATION",
      heating: ["GAS_BOILER"],
      views: ["MOUNTAIN"],
      amenities: ["wifi", "heating", "air_conditioning", "full_kitchen", "balcony_terrace", "parking"],
      kitchenKosher: "NOT_KOSHER",
      shabbatFeatures: ["mechanical_key", "stairs_or_shabbat_elevator"],
      jewishFeatures: ["host_speaks_hebrew"],
      price: 160,
      currency: "GEL",
      pricePeriod: "NIGHT",
      cleaningFee: 30,
      utilitiesIncluded: true,
      minStayNights: 1,
      ...STAY_RULES,
    },
    contact: { viber: true },
  },
];
