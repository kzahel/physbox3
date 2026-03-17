import { b2 } from "../engine/Box2D";
import type { Game } from "../engine/Game";

const MOVE_FORCE = 8;
const JUMP_IMPULSE = 6;
const MAX_SPEED = 6;

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

      if (jump && grounded && vel.y < 1) {
        torso.ApplyLinearImpulse(new B2.b2Vec2(0, JUMP_IMPULSE * torso.GetMass()), torso.GetPosition(), true);
      }
    }
  }
}
