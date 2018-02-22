import { System } from "../../ecs/System";
import { Position } from "../../core/components/Position";
import { BlockParticleEngine2 } from "../engines/BlockParticleEngine2";
import { Active } from "../../core/components/Active";
import { Entity } from "../../ecs/Entity";
import { ParticleEmitter } from "../components/ParticleEmitter";

export class ParticleSystem extends System {
    private blockParticleEngine: BlockParticleEngine2;
    constructor(blockParticleEngine: BlockParticleEngine2) {
        super([Position, Active, ParticleEmitter]);
        this.blockParticleEngine = blockParticleEngine;
    }

    updateEntity(entity: Entity, position:Position, active: Active, particleEmitter: ParticleEmitter) {
        particleEmitter.emitters.forEach(emitter => emitter.update(16, position.coords, this.blockParticleEngine));
    }

    public postUpdate() {
        this.blockParticleEngine.Update();
    }
}