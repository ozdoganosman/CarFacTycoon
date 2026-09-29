import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import timeline from "./timeline.json";
import { Grain, Vignette } from "./ui";
import { LangProvider, type Lang } from "./lang";
import {
  Cars,
  CrisisScene,
  EndScene,
  EngineScene,
  FactoryScene,
  Hook,
  LaunchScene,
  MapScene,
  PaperScene,
  RacingScene,
  ResearchScene,
  RivalsScene,
  ScoreScene,
  SoundScene,
  SuspScene,
} from "./scenes";

export type ShortProps = {
  /** The language of the captions and the game screens. */
  lang: Lang;
  /** The end card's call to action, e.g. where the link is. */
  cta: string;
  /** Play the generated soundtrack (npm run audio). */
  audio: boolean;
};

type SceneId = keyof typeof timeline.scenes;
const span = (id: SceneId) => {
  const [from, to] = timeline.scenes[id];
  return { from, durationInFrames: to - from };
};
export const TOTAL = Math.max(
  ...Object.values(timeline.scenes).map(([, to]) => to),
);

export const Short: React.FC<ShortProps> = ({ lang, cta, audio }) => {
  const d = (id: SceneId) => span(id).durationInFrames;
  return (
    <LangProvider lang={lang}>
      {/* lang so that CSS upper-casing follows the language (Turkish i → İ). */}
      <AbsoluteFill lang={lang} style={{ backgroundColor: "#14110e" }}>
        <Sequence {...span("hook")} name="Hook">
          <Hook />
        </Sequence>
        <Sequence {...span("cars")} name="Arabalar">
          <Cars duration={d("cars")} />
        </Sequence>
        <Sequence {...span("engine")} name="Motor">
          <EngineScene duration={d("engine")} />
        </Sequence>
        <Sequence {...span("sound")} name="Motor sesi">
          <SoundScene duration={d("sound")} />
        </Sequence>
        <Sequence {...span("susp")} name="Süspansiyon">
          <SuspScene duration={d("susp")} />
        </Sequence>
        <Sequence {...span("launch")} name="Lansman">
          <LaunchScene duration={d("launch")} />
        </Sequence>
        <Sequence {...span("map")} name="Harita">
          <MapScene duration={d("map")} />
        </Sequence>
        <Sequence {...span("paper")} name="Gazete">
          <PaperScene duration={d("paper")} />
        </Sequence>
        <Sequence {...span("factory")} name="Fabrika">
          <FactoryScene duration={d("factory")} />
        </Sequence>
        <Sequence {...span("rivals")} name="Rakipler ve kurul">
          <RivalsScene duration={d("rivals")} />
        </Sequence>
        <Sequence {...span("crisis")} name="Krizler">
          <CrisisScene duration={d("crisis")} />
        </Sequence>
        <Sequence {...span("research")} name="Ar-Ge">
          <ResearchScene duration={d("research")} />
        </Sequence>
        <Sequence {...span("racing")} name="Yarış">
          <RacingScene duration={d("racing")} />
        </Sequence>
        <Sequence {...span("score")} name="Skor">
          <ScoreScene duration={d("score")} />
        </Sequence>
        <Sequence {...span("end")} name="Kapanış">
          <EndScene duration={d("end")} cta={cta} />
        </Sequence>
        <Vignette />
        <Grain />
        {audio && <Audio src={staticFile("audio/soundtrack.wav")} />}
      </AbsoluteFill>
    </LangProvider>
  );
};
