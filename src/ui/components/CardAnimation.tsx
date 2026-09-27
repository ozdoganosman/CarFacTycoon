import { CARD_ANIMATIONS, type CardAnimationId } from '../cards/animations';

export function CardAnimation({ anim }: { anim: CardAnimationId }) {
  const C = CARD_ANIMATIONS[anim];
  return <div className="card-anim">{C ? <C /> : null}</div>;
}
