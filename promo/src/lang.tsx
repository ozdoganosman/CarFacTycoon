import React, { createContext, useContext } from "react";
import { staticFile } from "remotion";
import MAP_TR from "./map.json";
import MAP_EN from "./lang/map.en.json";

// The video's words in each language it is made in. Captions pop in word by word; {braces} pick words
// out in gold. The game screens come from `GAME_LANG=<lang> node capture/shots.mjs all`
// (Turkish in public/shots and public/seq, the others in public/<lang>/…).

export type Lang = "tr" | "en";

type Copy = {
  hookTyped: string;
  hook: string;
  cars: string;
  stages: string[];
  parts: string[];
  engine: string;
  soundOn: string;
  sound: string;
  susp: string;
  launch: string;
  reviews: string;
  mapChips: string[];
  states: (n: number) => string;
  map: string;
  paper: string;
  rival: string;
  board: string;
  factory: string;
  paperHead: string;
  crises: { year: string; title: string; sub: string }[];
  crisis: string;
  research: string;
  racing: string;
  score: string;
  ranks: string[];
  tagline: string;
  play: string;
  offline: string;
};

export const COPY: Record<Lang, Copy> = {
  tr: {
    hookTyped: "Bir atölye. 2 mühendis. 40 bin dolar.",
    hook: "1960'a kadar bir {otomobil devi} kurabilir misin?",
    cars: "Her arabayı {sen} tasarla",
    stages: [
      "Faeton · 1 silindir",
      "Roadster · 4 silindir",
      "Coupé · 4 silindir",
      "Sedan · 6 silindir",
      "Coupé · V8",
      "Sedan · 6 silindir",
      "Station · 6 silindir",
      "Sedan · V8",
    ],
    parts: ["Gövde", "Şasi", "Motor", "Şanzıman", "Süspansiyon"],
    engine: "Motoru {silindir silindir} kur",
    soundOn: "🔊 Sesi aç",
    sound: "Motorunu {dinle}",
    susp: "Deneme yolunda {sına}",
    launch: "{Lansman} günü",
    reviews: "Dergiler ne {diyecek?}",
    mapChips: ["Bayi ara", "Servis kur", "Nakliye öde"],
    states: (n) => `${n} eyalet`,
    map: "Eyalet eyalet {büyü}",
    paper: "{Manşetlere} çık",
    rival: "Öne geç, {rakipler saldırsın}",
    board: "Borsaya açıl, {kurula hesap ver}",
    factory: "Fabrikanı kur, {hattı büyüt}",
    paperHead: "MOTOR VE YOL · SON DAKİKA",
    crises: [
      {
        year: "1914",
        title: "Avrupa’da savaş",
        sub: "Çelik pahalandı: malzeme %25 zamlı.",
      },
      {
        year: "1920",
        title: "Savaş sonrası durgunluk",
        sub: "Alıcılar çekildi, stoklar şişti.",
      },
      {
        year: "1929",
        title: "Kara Perşembe",
        sub: "Borsa çöktü. Bankalar krediyi kısıyor.",
      },
      {
        year: "1942",
        title: "Sivil üretim durdu",
        sub: "Fabrikalar tank ve cip üretiyor.",
      },
    ],
    crisis: "Savaşlar. Buhranlar. {Krizler.}",
    research: "Rakiplerinden önce {icat et}",
    racing: "Yarış kazan, {rakiplerini satın al}",
    score: "60 yıl sonra {sen} ne olacaksın?",
    ranks: [
      "Butik atölye",
      "Saygın marka",
      "Büyük üretici",
      "Sanayi devi",
      "Efsane",
    ],
    tagline: "Amerika 1900–1960 · Otomobil fabrikanı kur",
    play: "▶ Ücretsiz oyna",
    offline: "İnternetsiz oynanır · Hesap gerekmez",
  },
  en: {
    hookTyped: "One workshop. 2 engineers. $40,000.",
    hook: "Can you build a {car giant} by 1960?",
    cars: "{You} design every car",
    stages: [
      "Phaeton · 1 cylinder",
      "Roadster · 4 cylinders",
      "Coupé · 4 cylinders",
      "Sedan · 6 cylinders",
      "Coupé · V8",
      "Sedan · 6 cylinders",
      "Station wagon · 6 cylinders",
      "Sedan · V8",
    ],
    parts: ["Body", "Chassis", "Engine", "Gearbox", "Suspension"],
    engine: "Build the engine {cylinder by cylinder}",
    soundOn: "🔊 Sound on",
    sound: "{Hear} your engine",
    susp: "Take it to the {test track}",
    launch: "{Launch} day",
    reviews: "What will the {magazines say?}",
    mapChips: ["Find dealers", "Open service shops", "Pay the freight"],
    states: (n) => (n === 1 ? "1 state" : `${n} states`),
    map: "Grow {state by state}",
    paper: "Make the {headlines}",
    rival: "Take the lead, {rivals strike back}",
    board: "Go public, {answer to the board}",
    factory: "Build your factory, {grow the line}",
    paperHead: "MOTOR & ROAD · EXTRA",
    crises: [
      {
        year: "1914",
        title: "War in Europe",
        sub: "Steel is dearer: materials up 25%.",
      },
      {
        year: "1920",
        title: "Post-war slump",
        sub: "Buyers pull back, unsold cars pile up.",
      },
      {
        year: "1929",
        title: "Black Thursday",
        sub: "The market has crashed. Banks cut credit.",
      },
      {
        year: "1942",
        title: "Civilian output halted",
        sub: "The factories build tanks and jeeps.",
      },
    ],
    crisis: "Wars. Depressions. {Crises.}",
    research: "{Invent it} before your rivals",
    racing: "Win races, {buy out your rivals}",
    score: "Where will {you} be in 60 years?",
    ranks: [
      "Boutique workshop",
      "Respected make",
      "Major manufacturer",
      "Industrial giant",
      "Legend",
    ],
    tagline: "America 1900–1960 · Build your car factory",
    play: "▶ Play free",
    offline: "Plays offline · No account needed",
  },
};

/** How many states sold the company's cars in each save year (written by capture/shots.mjs map). */
export const MAP_STEPS: Record<Lang, { year: number; states: number }[]> = {
  tr: MAP_TR,
  en: MAP_EN,
};

const LangContext = createContext<Lang>("tr");
export const LangProvider: React.FC<{
  lang: Lang;
  children: React.ReactNode;
}> = ({ lang, children }) => (
  <LangContext.Provider value={lang}>{children}</LangContext.Provider>
);
export const useLang = () => useContext(LangContext);
export const useCopy = () => COPY[useLang()];

/** The game screens captured in this language. */
export const useShots = () => {
  const lang = useLang();
  const base = lang === "tr" ? "" : `${lang}/`;
  return {
    shot: (name: string) => staticFile(`${base}shots/${name}.png`),
    seq: (name: string, i: number, count: number) =>
      staticFile(
        `${base}seq/${name}/${String(Math.max(0, Math.min(count - 1, Math.floor(i)))).padStart(4, "0")}.jpg`,
      ),
  };
};
