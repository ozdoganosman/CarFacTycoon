/* "Neden böyle çalışıyor?" explainer animations for the technology cards. */
import type { ComponentType } from 'react';
import './cards.css';
import { FourStroke } from './anim/FourStroke';
import { Gearbox } from './anim/Gearbox';
import { MovingLine } from './anim/MovingLine';
import { ElectricStarter } from './anim/ElectricStarter';
import { HydraulicBrake } from './anim/HydraulicBrake';
import { Synchromesh } from './anim/Synchromesh';
import { Monocoque } from './anim/Monocoque';
import { IndependentSuspension } from './anim/IndependentSuspension';
import { Duco } from './anim/Duco';
import { Supercharger } from './anim/Supercharger';

export type { FourStrokeProps } from './anim/FourStroke';
export {
  FourStroke,
  Gearbox,
  MovingLine,
  ElectricStarter,
  HydraulicBrake,
  Synchromesh,
  Monocoque,
  IndependentSuspension,
  Duco,
  Supercharger,
};

export type CardAnimationId =
  | 'fourStroke'
  | 'gearbox'
  | 'movingLine'
  | 'electricStarter'
  | 'hydraulicBrake'
  | 'synchromesh'
  | 'monocoque'
  | 'independentSuspension'
  | 'duco'
  | 'supercharger';

export const CARD_ANIMATIONS: Record<CardAnimationId, ComponentType> = {
  fourStroke: FourStroke,
  gearbox: Gearbox,
  movingLine: MovingLine,
  electricStarter: ElectricStarter,
  hydraulicBrake: HydraulicBrake,
  synchromesh: Synchromesh,
  monocoque: Monocoque,
  independentSuspension: IndependentSuspension,
  duco: Duco,
  supercharger: Supercharger,
};
