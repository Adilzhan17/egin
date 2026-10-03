import { PlatformLanguage } from "./i18n";

export interface KzCity {
  name: { ru: string; kk: string; en: string };
  center: [number, number]; // [lng, lat]
  zoom: number;
}

export interface KzDistrict {
  name: { ru: string; kk: string; en: string };
  center: [number, number];
  zoom: number;
  cities: KzCity[];
}

export interface KzRegion {
  name: { ru: string; kk: string; en: string };
  center: [number, number];
  zoom: number;
  districts: KzDistrict[];
}

export const KZ_CENTER: [number, number] = [66.9, 48.0];
export const KZ_ZOOM = 5;
export const KZ_BOUNDS: [[number, number], [number, number]] = [[46.5, 40.5], [87.5, 55.5]];

export const KZ_REGIONS: KzRegion[] = [
  {
    name: { ru: "Акмолинская область", kk: "Ақмола облысы", en: "Akmola Region" },
    center: [71.4, 51.1],
    zoom: 7,
    districts: [
      { name: { ru: "Аккольский район", kk: "Ақкөл ауданы", en: "Akkol District" }, center: [70.95, 51.48], zoom: 10, cities: [
        { name: { ru: "г. Акколь", kk: "Ақкөл қ.", en: "Akkol" }, center: [70.95, 51.48], zoom: 13 },
      ]},
      { name: { ru: "Аршалынский район", kk: "Аршалы ауданы", en: "Arshaly District" }, center: [71.14, 50.93], zoom: 10, cities: [
        { name: { ru: "п. Аршалы", kk: "Аршалы к.", en: "Arshaly" }, center: [71.14, 50.93], zoom: 13 },
      ]},
      { name: { ru: "Атбасарский район", kk: "Атбасар ауданы", en: "Atbasar District" }, center: [68.36, 51.82], zoom: 10, cities: [
        { name: { ru: "г. Атбасар", kk: "Атбасар қ.", en: "Atbasar" }, center: [68.36, 51.82], zoom: 13 },
      ]},
      { name: { ru: "Целиноградский район", kk: "Целиноград ауданы", en: "Tselinograd District" }, center: [71.43, 51.13], zoom: 10, cities: [] },
      { name: { ru: "Коргалжынский район", kk: "Қорғалжын ауданы", en: "Korgalzhyn District" }, center: [69.37, 50.59], zoom: 10, cities: [
        { name: { ru: "п. Коргалжын", kk: "Қорғалжын к.", en: "Korgalzhyn" }, center: [69.37, 50.59], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Актюбинская область", kk: "Ақтөбе облысы", en: "Aktobe Region" },
    center: [57.2, 50.3],
    zoom: 7,
    districts: [
      { name: { ru: "г. Актобе", kk: "Ақтөбе қ.", en: "Aktobe city" }, center: [57.21, 50.28], zoom: 12, cities: [] },
      { name: { ru: "Алгинский район", kk: "Алға ауданы", en: "Alga District" }, center: [56.85, 49.89], zoom: 10, cities: [
        { name: { ru: "г. Алга", kk: "Алға қ.", en: "Alga" }, center: [56.85, 49.89], zoom: 13 },
      ]},
      { name: { ru: "Хромтауский район", kk: "Хромтау ауданы", en: "Khromtau District" }, center: [58.44, 50.26], zoom: 10, cities: [
        { name: { ru: "г. Хромтау", kk: "Хромтау қ.", en: "Khromtau" }, center: [58.44, 50.26], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Алматинская область", kk: "Алматы облысы", en: "Almaty Region" },
    center: [77.0, 44.5],
    zoom: 7,
    districts: [
      { name: { ru: "Талгарский район", kk: "Талғар ауданы", en: "Talgar District" }, center: [77.24, 43.30], zoom: 10, cities: [
        { name: { ru: "г. Талгар", kk: "Талғар қ.", en: "Talgar" }, center: [77.24, 43.30], zoom: 13 },
      ]},
      { name: { ru: "Илийский район", kk: "Іле ауданы", en: "Ile District" }, center: [76.87, 43.52], zoom: 10, cities: [
        { name: { ru: "п. Отеген батыр", kk: "Отеген батыр к.", en: "Otegen Batyr" }, center: [76.87, 43.52], zoom: 13 },
      ]},
      { name: { ru: "Карасайский район", kk: "Қарасай ауданы", en: "Karasay District" }, center: [76.53, 43.19], zoom: 10, cities: [
        { name: { ru: "г. Каскелен", kk: "Қаскелең қ.", en: "Kaskelen" }, center: [76.62, 43.20], zoom: 13 },
      ]},
      { name: { ru: "Енбекшиказахский район", kk: "Еңбекшіқазақ ауданы", en: "Enbekshikazakh District" }, center: [77.60, 43.32], zoom: 10, cities: [
        { name: { ru: "г. Есик", kk: "Есік қ.", en: "Esik" }, center: [77.44, 43.36], zoom: 13 },
      ]},
      { name: { ru: "Жамбылский район", kk: "Жамбыл ауданы", en: "Zhambyl District" }, center: [76.31, 43.53], zoom: 10, cities: [
        { name: { ru: "с. Узынагаш", kk: "Ұзынағаш а.", en: "Uzynagash" }, center: [76.31, 43.53], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Атырауская область", kk: "Атырау облысы", en: "Atyrau Region" },
    center: [51.9, 47.1],
    zoom: 7,
    districts: [
      { name: { ru: "г. Атырау", kk: "Атырау қ.", en: "Atyrau city" }, center: [51.88, 47.10], zoom: 12, cities: [] },
      { name: { ru: "Жылыойский район", kk: "Жылыой ауданы", en: "Zhylyoi District" }, center: [52.79, 46.84], zoom: 10, cities: [
        { name: { ru: "г. Кульсары", kk: "Құлсары қ.", en: "Kulsary" }, center: [54.01, 46.95], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Восточно-Казахстанская область", kk: "Шығыс Қазақстан облысы", en: "East Kazakhstan Region" },
    center: [82.6, 49.9],
    zoom: 7,
    districts: [
      { name: { ru: "г. Усть-Каменогорск", kk: "Өскемен қ.", en: "Ust-Kamenogorsk" }, center: [82.62, 49.95], zoom: 12, cities: [] },
      { name: { ru: "г. Семей", kk: "Семей қ.", en: "Semey" }, center: [80.23, 50.42], zoom: 12, cities: [] },
      { name: { ru: "Зыряновский район", kk: "Зырян ауданы", en: "Zyryanov District" }, center: [84.27, 49.74], zoom: 10, cities: [
        { name: { ru: "г. Алтай", kk: "Алтай қ.", en: "Altay" }, center: [84.27, 49.74], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Жамбылская область", kk: "Жамбыл облысы", en: "Zhambyl Region" },
    center: [71.4, 43.2],
    zoom: 7,
    districts: [
      { name: { ru: "г. Тараз", kk: "Тараз қ.", en: "Taraz" }, center: [71.37, 42.90], zoom: 12, cities: [] },
      { name: { ru: "Кордайский район", kk: "Қордай ауданы", en: "Korday District" }, center: [74.06, 43.09], zoom: 10, cities: [
        { name: { ru: "п. Кордай", kk: "Қордай к.", en: "Korday" }, center: [74.06, 43.09], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Западно-Казахстанская область", kk: "Батыс Қазақстан облысы", en: "West Kazakhstan Region" },
    center: [51.4, 50.3],
    zoom: 7,
    districts: [
      { name: { ru: "г. Уральск", kk: "Орал қ.", en: "Uralsk" }, center: [51.37, 51.23], zoom: 12, cities: [] },
      { name: { ru: "Бурлинский район", kk: "Бөрлі ауданы", en: "Burlin District" }, center: [52.73, 51.21], zoom: 10, cities: [] },
    ],
  },
  {
    name: { ru: "Карагандинская область", kk: "Қарағанды облысы", en: "Karaganda Region" },
    center: [73.1, 49.8],
    zoom: 7,
    districts: [
      { name: { ru: "г. Караганда", kk: "Қарағанды қ.", en: "Karaganda" }, center: [73.10, 49.80], zoom: 12, cities: [] },
      { name: { ru: "г. Темиртау", kk: "Теміртау қ.", en: "Temirtau" }, center: [72.96, 50.06], zoom: 12, cities: [] },
      { name: { ru: "г. Жезказган", kk: "Жезқазған қ.", en: "Zhezkazgan" }, center: [67.71, 47.78], zoom: 12, cities: [] },
      { name: { ru: "Бухар-Жырауский район", kk: "Бұқар-Жырау ауданы", en: "Bukhar-Zhyrau District" }, center: [73.29, 49.53], zoom: 10, cities: [] },
    ],
  },
  {
    name: { ru: "Костанайская область", kk: "Қостанай облысы", en: "Kostanay Region" },
    center: [63.6, 52.0],
    zoom: 7,
    districts: [
      { name: { ru: "г. Костанай", kk: "Қостанай қ.", en: "Kostanay" }, center: [63.63, 53.21], zoom: 12, cities: [] },
      { name: { ru: "г. Рудный", kk: "Рудный қ.", en: "Rudny" }, center: [63.13, 52.97], zoom: 12, cities: [] },
      { name: { ru: "Лисаковский район", kk: "Лисаков ауданы", en: "Lisakovsk District" }, center: [62.50, 52.54], zoom: 10, cities: [] },
    ],
  },
  {
    name: { ru: "Кызылординская область", kk: "Қызылорда облысы", en: "Kyzylorda Region" },
    center: [65.5, 44.8],
    zoom: 7,
    districts: [
      { name: { ru: "г. Кызылорда", kk: "Қызылорда қ.", en: "Kyzylorda" }, center: [65.51, 44.85], zoom: 12, cities: [] },
      { name: { ru: "Аральский район", kk: "Арал ауданы", en: "Aral District" }, center: [61.66, 46.80], zoom: 10, cities: [
        { name: { ru: "г. Аральск", kk: "Арал қ.", en: "Aralsk" }, center: [61.66, 46.80], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Мангистауская область", kk: "Маңғыстау облысы", en: "Mangystau Region" },
    center: [51.1, 43.3],
    zoom: 7,
    districts: [
      { name: { ru: "г. Актау", kk: "Ақтау қ.", en: "Aktau" }, center: [51.15, 43.65], zoom: 12, cities: [] },
      { name: { ru: "г. Жанаозен", kk: "Жаңаөзен қ.", en: "Zhanaozen" }, center: [52.86, 43.35], zoom: 12, cities: [] },
    ],
  },
  {
    name: { ru: "Павлодарская область", kk: "Павлодар облысы", en: "Pavlodar Region" },
    center: [76.9, 52.3],
    zoom: 7,
    districts: [
      { name: { ru: "г. Павлодар", kk: "Павлодар қ.", en: "Pavlodar" }, center: [76.95, 52.29], zoom: 12, cities: [] },
      { name: { ru: "г. Экибастуз", kk: "Екібастұз қ.", en: "Ekibastuz" }, center: [75.33, 51.73], zoom: 12, cities: [] },
      { name: { ru: "Аксуский район", kk: "Ақсу ауданы", en: "Aksu District" }, center: [76.92, 52.04], zoom: 10, cities: [
        { name: { ru: "г. Аксу", kk: "Ақсу қ.", en: "Aksu" }, center: [76.92, 52.04], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Северо-Казахстанская область", kk: "Солтүстік Қазақстан облысы", en: "North Kazakhstan Region" },
    center: [69.1, 54.1],
    zoom: 7,
    districts: [
      { name: { ru: "г. Петропавловск", kk: "Петропавл қ.", en: "Petropavlovsk" }, center: [69.14, 54.87], zoom: 12, cities: [] },
      { name: { ru: "Тайыншинский район", kk: "Тайынша ауданы", en: "Tayynsha District" }, center: [68.47, 53.85], zoom: 10, cities: [
        { name: { ru: "г. Тайынша", kk: "Тайынша қ.", en: "Tayynsha" }, center: [68.47, 53.85], zoom: 13 },
      ]},
    ],
  },
  {
    name: { ru: "Туркестанская область", kk: "Түркістан облысы", en: "Turkestan Region" },
    center: [68.3, 41.5],
    zoom: 7,
    districts: [
      { name: { ru: "г. Туркестан", kk: "Түркістан қ.", en: "Turkestan" }, center: [68.25, 43.30], zoom: 12, cities: [] },
      { name: { ru: "г. Шымкент", kk: "Шымкент қ.", en: "Shymkent" }, center: [69.60, 42.32], zoom: 12, cities: [] },
      { name: { ru: "Ордабасынский район", kk: "Ордабасы ауданы", en: "Ordabasy District" }, center: [69.14, 41.80], zoom: 10, cities: [] },
      { name: { ru: "Сайрамский район", kk: "Сайрам ауданы", en: "Sayram District" }, center: [69.73, 42.33], zoom: 10, cities: [] },
    ],
  },
  {
    name: { ru: "Улытауская область", kk: "Ұлытау облысы", en: "Ulytau Region" },
    center: [66.8, 48.5],
    zoom: 7,
    districts: [
      { name: { ru: "г. Жезказган", kk: "Жезқазған қ.", en: "Zhezkazgan" }, center: [67.71, 47.78], zoom: 12, cities: [] },
      { name: { ru: "г. Сатпаев", kk: "Сәтбаев қ.", en: "Satpayev" }, center: [67.53, 47.90], zoom: 12, cities: [] },
    ],
  },
  {
    name: { ru: "г. Астана", kk: "Астана қ.", en: "Astana" },
    center: [71.43, 51.13],
    zoom: 11,
    districts: [
      { name: { ru: "Байконыр", kk: "Байқоңыр", en: "Baykonur" }, center: [71.49, 51.17], zoom: 13, cities: [] },
      { name: { ru: "Есиль", kk: "Есіл", en: "Yesil" }, center: [71.41, 51.14], zoom: 13, cities: [] },
      { name: { ru: "Алматы (район)", kk: "Алматы (аудан)", en: "Almaty district" }, center: [71.38, 51.10], zoom: 13, cities: [] },
      { name: { ru: "Сарыарка", kk: "Сарыарқа", en: "Saryarka" }, center: [71.47, 51.12], zoom: 13, cities: [] },
    ],
  },
  {
    name: { ru: "г. Алматы", kk: "Алматы қ.", en: "Almaty" },
    center: [76.95, 43.24],
    zoom: 11,
    districts: [
      { name: { ru: "Алмалинский район", kk: "Алмалы ауданы", en: "Almaly District" }, center: [76.91, 43.26], zoom: 13, cities: [] },
      { name: { ru: "Бостандыкский район", kk: "Бостандық ауданы", en: "Bostandyk District" }, center: [76.92, 43.22], zoom: 13, cities: [] },
      { name: { ru: "Медеуский район", kk: "Медеу ауданы", en: "Medeu District" }, center: [76.96, 43.24], zoom: 13, cities: [] },
      { name: { ru: "Ауэзовский район", kk: "Әуезов ауданы", en: "Auezov District" }, center: [76.84, 43.22], zoom: 13, cities: [] },
    ],
  },
];

export const getRegionName = (region: KzRegion | KzDistrict | KzCity, lang: PlatformLanguage) =>
  region.name[lang];
