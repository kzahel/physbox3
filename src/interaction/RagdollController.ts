import { b2 } from "../engine/Box2D";
import type { Game } from "../engine/Game";

const MOVE_FORCE = 25;
const JUMP_IMPULSE = 6;
const MAX_SPEED = 8;
const MAX_FLY_SPEED = 15;

export class RagdollController {
  private keys: Set<string>;
  private game: Game;

  constructor(game: Game, keys: Set<string>) {
    this.game = game;
    this.keys = keys;
  }

  update() {
    const B2 = b2();
    const left = this.keys.has("ArrowLeft");
    const right = this.keys.has("ArrowRight");
    const jump = this.keys.has("ArrowUp");
    const down = this.keys.has("ArrowDown");

    for (const rd of this.game.ragdolls) {
      const torso = rd.torso;
      if (!torso.IsValid() || !torso.IsEnabled()) continue;
      const vel = torso.GetLinearVelocity();
      const grounded = rd.footContacts > 0;

      if (left && vel.x > -MAX_SPEED) {
        torso.ApplyForceToCenter(new B2.b2Vec2(-MOVE_FORCE * torso.GetMass(), 0), true);
      }
      if (right && vel.x < MAX_SPEED) {
        torso.ApplyForceToCenter(new B2.b2Vec2(MOVE_FORCE * torso.GetMass(), 0), true);
      }

      if (jump && vel.y < MAX_FLY_SPEED) {
        const impulse = grounded ? JUMP_IMPULSE : JUMP_IMPULSE * 0.5;
        torso.ApplyLinearImpulse(new B2.b2Vec2(0, impulse * torso.GetMass()), torso.GetPosition(), true);
      }
      if (down && vel.y > -MAX_FLY_SPEED) {
        torso.ApplyLinearImpulse(new B2.b2Vec2(0, -JUMP_IMPULSE * 0.5 * torso.GetMass()), torso.GetPosition(), true);
      }
    }
  }
}
