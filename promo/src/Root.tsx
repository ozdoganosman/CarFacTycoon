import React from 'react';
import { Composition } from 'remotion';
import timeline from './timeline.json';
import { Short, TOTAL, type ShortProps } from './Short';

const defaults: ShortProps = { cta: 'Oyunun linki profilde', audio: true };

export const Root: React.FC = () => (
  <Composition id="Short" component={Short} durationInFrames={TOTAL} fps={timeline.fps} width={1080} height={1920} defaultProps={defaults} />
);
