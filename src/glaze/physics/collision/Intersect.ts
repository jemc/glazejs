import { Contact } from "./Contact";
import { BFProxy } from "./BFProxy";
import { Filter } from "./Filter";
import { Vector2 } from "../../geom/Vector2";
import { Body } from "../Body";
import { Ray } from "./Ray";
import { Segment } from "../../geom/Segment";

const contact: Contact = new Contact();

const epsilon: number = 1e-8;

let collideCount: number = 0;

export const Collide = function(proxyA: BFProxy, proxyB: BFProxy): boolean {
    collideCount++;
    //Exit on static vs statics, they should never be sent but you never know
    //Sensors dont trigger other sensors
    if ((proxyA.isStatic && proxyB.isStatic) || (proxyA.isSensor && proxyB.isSensor)) return false;

    if (!proxyA.isActive || !proxyB.isActive) return false;

    //Do filtering
    if (!Filter.CHECK(proxyA.filter, proxyB.filter)) return false;

    var collided = false;

    if (proxyA.isSensor || proxyB.isSensor) {
        //One is a sensor so just check for overlap
        collided = StaticAABBvsStaticAABB(
            proxyA.aabb.position,
            proxyA.aabb.extents,
            proxyB.aabb.position,
            proxyB.aabb.extents,
            contact,
        );

        //TODO should we make a special case for bullets?
    } else if (!proxyA.isStatic && !proxyB.isStatic) {
        //Both are dynamic, which means both have bodies
        if (proxyA.body.isBullet && proxyB.body.isBullet) {
            //Both bullets? for now nothing
            return false;
        } else if (proxyA.body.isBullet) {
            //Just A is a bullet
            if (
                StaticAABBvsSweeptAABB(
                    proxyB.aabb.position,
                    proxyB.aabb.extents,
                    proxyA.aabb.position,
                    proxyA.aabb.extents,
                    proxyA.body.delta,
                    contact,
                ) == true
            ) {
                proxyA.body.respondBulletCollision(contact);
                collided = true;
            }
        } else if (proxyB.body.isBullet) {
            //Just B is a bullet
            if (
                StaticAABBvsSweeptAABB(
                    proxyA.aabb.position,
                    proxyA.aabb.extents,
                    proxyB.aabb.position,
                    proxyB.aabb.extents,
                    proxyB.body.delta,
                    contact,
                ) == true
            ) {
                proxyB.body.respondBulletCollision(contact);
                collided = true;
            }
        } else {
            //Regular dynamic<>dynamic
            collided = StaticAABBvsStaticAABB(
                proxyA.aabb.position,
                proxyA.aabb.extents,
                proxyB.aabb.position,
                proxyB.aabb.extents,
                contact,
            );
        }
    } else {
        //Were just left with static<>dynamic collisions
        //Order them
        var staticProxy, dynamicProxy;
        if (proxyA.isStatic) {
            staticProxy = proxyA;
            dynamicProxy = proxyB;
        } else {
            staticProxy = proxyB;
            dynamicProxy = proxyA;
        }
        //Test
        if (dynamicProxy.body.isBullet) {
            collided = BulletAABB(dynamicProxy, staticProxy);
            if (collided) {
                dynamicProxy.body.respondBulletCollision(contact);
            }
        } else {
            AABBvsStaticSolidAABB(
                dynamicProxy.aabb.position,
                dynamicProxy.aabb.extents,
                staticProxy.aabb.position,
                staticProxy.aabb.extents,
                staticProxy.responseBias,
                contact,
            );
            //We have to the response process and get the result
            collided = dynamicProxy.body.respondStaticCollision(contact);
        }
    }

    if (collided == true) {
        proxyA.collide(proxyB, contact);
        proxyB.collide(proxyA, contact);
    }

    return collided;
};

export const BulletAABB = function(segmentProxy: BFProxy, staticProxy: BFProxy): boolean {
    // return StaticSegmentvsStaticAABB(staticProxy.aabb.position,staticProxy.aabb.extents,segmentProxy.body.position,segmentProxy.body.delta,0,0,contact);
    return StaticAABBvsSweeptAABB(
        staticProxy.aabb.position,
        staticProxy.aabb.extents,
        segmentProxy.aabb.position,
        segmentProxy.aabb.extents,
        segmentProxy.body.delta,
        contact,
    );
};

export const RayAABB = function(ray: Ray, proxy: BFProxy): boolean {
    if (StaticSegmentvsStaticAABB(proxy.aabb.position, proxy.aabb.extents, ray.origin, ray.delta, 0, 0, contact)) {
        ray.report(contact.delta.x, contact.delta.y, contact.normal.x, contact.normal.y, proxy);
        return true;
    }
    return false;
};

export const Spring = function(bodyA: Body, bodyB: Body, length: number, k: number) {
    var dx = bodyA.position.x - bodyB.position.x;
    var dy = bodyA.position.y - bodyB.position.y;
    // But, we need to account for 'rest length' being `l` not 0
    // Normalize dx and dy to length 1; purely directional. `_n` means 'normalized' here
    var dist = Math.sqrt(dx * dx + dy * dy); //+0.000001;
    if (dist < length) return;
    var dx_n = dx / dist;
    var dy_n = dy / dist;

    var true_offset = dist - length;
    dx_n *= true_offset;
    dy_n *= true_offset;
    var fx = k * dx_n;
    var fy = k * dy_n;
    bodyA.addForce(new Vector2(fx, fy));
    bodyB.addForce(new Vector2(-fx, -fy));
    // bodyA.collisionForce.plusEquals(new Vector2(fx,fy));
    // bodyB.collisionForce.plusEquals(new Vector2(-fx,-fy));
};

export const StaticAABBvsStaticAABB = function(
    aabb_position_A: Vector2,
    aabb_extents_A: Vector2,
    aabb_position_B: Vector2,
    aabb_extents_B: Vector2,
    contact: Contact,
): boolean {
    var dx = aabb_position_B.x - aabb_position_A.x;
    var px = aabb_extents_B.x + aabb_extents_A.x - Math.abs(dx);
    if (px <= 0) return false;
    var dy = aabb_position_B.y - aabb_position_A.y;
    var py = aabb_extents_B.y + aabb_extents_A.y - Math.abs(dy);
    if (py <= 0) return false;
    if (px < py) {
        var sx = dx < 0 ? -1 : 1;
        contact.distance = contact.delta.x = px * sx;
        contact.delta.y = 0;
        contact.normal.x = sx;
        contact.normal.y = 0;
        contact.position.x = aabb_position_A.x + aabb_extents_A.x * sx;
        contact.position.y = aabb_position_B.y;
    } else {
        var sy = dy < 0 ? -1 : 1;
        contact.delta.x = 0;
        contact.distance = contact.delta.y = py * sy;
        contact.normal.x = 0;
        contact.normal.y = sy;
        contact.position.x = aabb_position_B.x;
        contact.position.y = aabb_position_A.y + aabb_extents_A.y * sy;
    }
    return true;
};

export const IsSegVsAABB = function(
    segment: Segment,
    aabb_position: Vector2,
    aabb_extents: Vector2,
    paddingX: number,
    paddingY: number,
) {
    return IsStaticSegmentvsStaticAABB(
        aabb_position,
        aabb_extents,
        segment.start,
        segment.scale,
        segment.sign,
        paddingX,
        paddingY,
    );
};

export const IsStaticSegmentvsStaticAABB = function(
    aabb_position: Vector2,
    aabb_extents: Vector2,
    segment_position: Vector2,
    scale: Vector2,
    sign: Vector2,
    paddingX: number,
    paddingY: number,
): boolean {
    // var scale.x = 1/segment_delta.x;
    // var scale.y = 1/segment_delta.y;

    // var sign.x = scale.x<0 ? -1 : 1;
    // var sign.y = scale.y<0 ? -1 : 1;

    var nearTimeX = (aabb_position.x - sign.x * (aabb_extents.x + paddingX) - segment_position.x) * scale.x;
    var nearTimeY = (aabb_position.y - sign.y * (aabb_extents.y + paddingY) - segment_position.y) * scale.y;

    var farTimeX = (aabb_position.x + sign.x * (aabb_extents.x + paddingX) - segment_position.x) * scale.x;
    var farTimeY = (aabb_position.y + sign.y * (aabb_extents.y + paddingY) - segment_position.y) * scale.y;

    if (nearTimeX > farTimeY || nearTimeY > farTimeX) return false;

    var nearTime = Math.max(nearTimeX, nearTimeY);
    var farTime = Math.min(farTimeX, farTimeY);

    if (nearTime >= 1 || farTime <= 0) return false;

    return true;
};

export const StaticSegmentvsStaticAABB = function(
    aabb_position: Vector2,
    aabb_extents: Vector2,
    segment_position: Vector2,
    segment_delta: Vector2,
    paddingX: number,
    paddingY: number,
    contact: Contact,
): boolean {
    var scaleX = 1 / segment_delta.x;
    var scaleY = 1 / segment_delta.y;

    var signX = scaleX < 0 ? -1 : 1;
    var signY = scaleY < 0 ? -1 : 1;

    var nearTimeX = (aabb_position.x - signX * (aabb_extents.x + paddingX) - segment_position.x) * scaleX;
    var nearTimeY = (aabb_position.y - signY * (aabb_extents.y + paddingY) - segment_position.y) * scaleY;

    var farTimeX = (aabb_position.x + signX * (aabb_extents.x + paddingX) - segment_position.x) * scaleX;
    var farTimeY = (aabb_position.y + signY * (aabb_extents.y + paddingY) - segment_position.y) * scaleY;

    if (nearTimeX > farTimeY || nearTimeY > farTimeX) return false;

    var nearTime = Math.max(nearTimeX, nearTimeY);
    var farTime = Math.min(farTimeX, farTimeY);

    if (nearTime >= 1 || farTime <= 0) return false;

    contact.time = Math.min(Math.max(nearTime, 0), 1);
    if (nearTimeX > nearTimeY) {
        contact.normal.x = -signX;
        contact.normal.y = 0;
    } else {
        contact.normal.x = 0;
        contact.normal.y = -signY;
    }

    contact.delta.x = contact.time * segment_delta.x;
    contact.delta.y = contact.time * segment_delta.y;

    contact.position.x = segment_position.x + contact.delta.x;
    contact.position.y = segment_position.y + contact.delta.y;

    return true;
};

export const StaticAABBvsSweeptAABB = function(
    aabb_position_A: Vector2,
    aabb_extents_A: Vector2,
    aabb_position_B: Vector2,
    aabb_extents_B: Vector2,
    aabb_delta_B: Vector2,
    contact: Contact,
): boolean {
    if (aabb_delta_B.x == 0 && aabb_delta_B.y == 0) {
        contact.sweepPosition.x = aabb_position_B.x;
        contact.sweepPosition.y = aabb_position_B.y;
        if (StaticAABBvsStaticAABB(aabb_position_A, aabb_extents_A, aabb_position_B, aabb_extents_B, contact)) {
            contact.time = 0;
            return true;
        } else {
            contact.time = 1;
            return false;
        }
    } else {
        if (
            StaticSegmentvsStaticAABB(
                aabb_position_A,
                aabb_extents_A,
                aabb_position_B,
                aabb_delta_B,
                aabb_extents_B.x,
                aabb_extents_B.y,
                contact,
            )
        ) {
            contact.time = Math.min(Math.max(contact.time - epsilon, 0), 1);
            contact.sweepPosition.x = aabb_position_B.x + aabb_delta_B.x * contact.time;
            contact.sweepPosition.y = aabb_position_B.y + aabb_delta_B.y * contact.time;
            //Inline expanded normalize to avoid object creation
            var t = Math.sqrt(aabb_delta_B.x * aabb_delta_B.x + aabb_delta_B.y * aabb_delta_B.y);
            contact.position.x += aabb_delta_B.x / t * aabb_extents_B.x;
            contact.position.y += aabb_delta_B.y / t * aabb_extents_B.y;
            return true;
        } else {
            contact.sweepPosition.x = aabb_position_B.x * aabb_delta_B.x;
            contact.sweepPosition.y = aabb_position_B.y * aabb_delta_B.y;
            return false;
        }
    }
};

export const AABBvsStaticSolidAABB = function(
    aabb_position_A: Vector2,
    aabb_extents_A: Vector2,
    aabb_position_B: Vector2,
    aabb_extents_B: Vector2,
    bias: Vector2,
    contact: Contact,
): boolean {
    //New overlap code, handle corners better
    var dx = aabb_position_B.x - aabb_position_A.x;
    var px = aabb_extents_B.x + aabb_extents_A.x - Math.abs(dx);

    var dy = aabb_position_B.y - aabb_position_A.y;
    var py = aabb_extents_B.y + aabb_extents_A.y - Math.abs(dy);

    if (px < py) {
        contact.normal.x = dx < 0 ? 1 : -1;
        contact.normal.y = 0;
    } else {
        contact.normal.x = 0;
        contact.normal.y = dy < 0 ? 1 : -1;
    }

    contact.normal.x *= bias.x;
    contact.normal.y *= bias.y;

    // var dx = aabb_position_B.x - aabb_position_A.x;
    // var dy = aabb_position_B.y - aabb_position_A.y;

    // if (dx*dx>dy*dy) {
    //     contact.normal.x = dx>=0 ? -1: 1;
    //     contact.normal.y = 0;
    // } else {
    //     contact.normal.x = 0;
    //     contact.normal.y = dy>=0 ? -1 : 1;
    // }
    var pcx = contact.normal.x * (aabb_extents_A.x + aabb_extents_B.x) + aabb_position_B.x;
    var pcy = contact.normal.y * (aabb_extents_A.y + aabb_extents_B.y) + aabb_position_B.y;

    var pdx = aabb_position_A.x - pcx;
    var pdy = aabb_position_A.y - pcy;

    contact.distance = pdx * contact.normal.x + pdy * contact.normal.y;

    return true;
};

// public static Stairs(aabb_position_A:Vector2,aabb_extents_A:Vector2,aabb_position_B:Vector2,aabb_extents_B:Vector2,bias:Vector2,contact:Contact):number {

//      //New overlap code, handle corners better
//      var dx = aabb_position_B.x - aabb_position_A.x;
//      var px = (aabb_extents_B.x + aabb_extents_A.x) - Math.abs(dx);

//      var dy = aabb_position_B.y - aabb_position_A.y;
//      var py = (aabb_extents_B.y + aabb_extents_A.y) - Math.abs(dy);

//      if (px<py) {
//          contact.normal.x = dx<0 ? 1 : -1;
//          contact.normal.y = 0;
//      } else {
//          contact.normal.x = 0;
//          contact.normal.y = dy<0 ? 1 : -1;
//      }

//      contact.normal.x = 0;
//      contact.normal.y = -1;

//      var pcx = (contact.normal.x * (aabb_extents_A.x+aabb_extents_B.x) ) + aabb_position_B.x;
//      var pcy = (contact.normal.y * (aabb_extents_A.y+aabb_extents_B.y) ) + aabb_position_B.y;

//      var pdx = aabb_position_A.x - pcx;
//      var pdy = aabb_position_A.y - pcy;

//      contact.distance = pdx*contact.normal.x + pdy*contact.normal.y;

//      if (px<py) {
//          return dx<0 ? 1 : -1;
//      }
//      return 0;
//  }

/*
    This is seperate to avoid overcomplicating the above with too much branching
    */
export const AABBvsStaticSolidAABBFixedNormal = function(
    aabb_position_A: Vector2,
    aabb_extents_A: Vector2,
    aabb_position_B: Vector2,
    aabb_extents_B: Vector2,
    normal: Vector2,
    contact: Contact,
): boolean {
    contact.normal.copy(normal);

    var pcx = contact.normal.x * (aabb_extents_A.x + aabb_extents_B.x) + aabb_position_B.x;
    var pcy = contact.normal.y * (aabb_extents_A.y + aabb_extents_B.y) + aabb_position_B.y;

    var pdx = aabb_position_A.x - pcx;
    var pdy = aabb_position_A.y - pcy;

    contact.distance = pdx * contact.normal.x + pdy * contact.normal.y;

    return true;
};

const AABBvsStaticSolidAABBSlope = function(
    aabb_position_A: Vector2,
    aabb_extents_A: Vector2,
    aabb_position_B: Vector2,
    aabb_extents_B: Vector2,
    bias: Vector2,
    contact: Contact,
): boolean {
    var _sqr = 0.70710678118655;

    //New overlap code, handle corners better
    var dx = aabb_position_B.x - aabb_position_A.x;
    var px = aabb_extents_B.x + aabb_extents_A.x - Math.abs(dx);

    var dy = aabb_position_B.y - aabb_position_A.y;
    var py = aabb_extents_B.y + aabb_extents_A.y - Math.abs(dy);

    // if (px<py) {
    //     contact.normal.x = dx<0 ? 1 : -1;
    //     contact.normal.y = 0;
    // } else {
    //     contact.normal.x = 0;
    //     contact.normal.y = dy<0 ? 1 : -1;
    // }

    // contact.normal.x *= bias.x;
    // contact.normal.y *= bias.y;

    contact.normal.x = -_sqr;
    contact.normal.y = -_sqr;

    // var dx = aabb_position_B.x - aabb_position_A.x;
    // var dy = aabb_position_B.y - aabb_position_A.y;

    // if (dx*dx>dy*dy) {
    //     contact.normal.x = dx>=0 ? -1: 1;
    //     contact.normal.y = 0;
    // } else {
    //     contact.normal.x = 0;
    //     contact.normal.y = dy>=0 ? -1 : 1;
    // }
    var pcx = contact.normal.x * (aabb_extents_A.x + aabb_extents_B.x) + aabb_position_B.x;
    var pcy = contact.normal.y * (aabb_extents_A.y + aabb_extents_B.y) + aabb_position_B.y;

    var pdx = aabb_position_A.x - pcx - 8;
    var pdy = aabb_position_A.y - pcy;

    contact.distance = pdx * contact.normal.x + pdy * contact.normal.y;

    return true;
};