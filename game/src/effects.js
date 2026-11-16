// Pooled visual effects: tracers, impact sparks and explosions. Nothing is
// allocated per frame — a fixed pool of line segments and sprites is reused,
// which keeps the hot loop free of garbage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createEffects(scene) {
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(24 * 2 * 3); // 24 tracers, 2 points each
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracers = new THREE.LineSegments(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 }),
  );
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(24);
  let tracerNext = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(96 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.14, transparent: true, opacity: 0.95, sizeAttenuation: true }),
  );
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(96 * 3);
  const sparkLife = new Float32Array(96);
  let sparkNext = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(boomLight);
  let boomLife = 0;

  const tmp = new THREE.Vector3();

  return {
    tracer(from, to) {
      const i = tracerNext;
      tracerNext = (tracerNext + 1) % 24;
      tracerPos[i * 6] = from.x; tracerPos[i * 6 + 1] = from.y; tracerPos[i * 6 + 2] = from.z;
      tracerPos[i * 6 + 3] = to.x; tracerPos[i * 6 + 4] = to.y; tracerPos[i * 6 + 5] = to.z;
      tracerLife[i] = 0.09;
      tracerGeo.attributes.position.needsUpdate = true;
    },
    impact(point, normal) {
      for (let n = 0; n < 6; n += 1) {
        const i = sparkNext;
        sparkNext = (sparkNext + 1) % 96;
        sparkPos[i * 3] = point.x; sparkPos[i * 3 + 1] = point.y; sparkPos[i * 3 + 2] = point.z;
        tmp.copy(normal).multiplyScalar(2 + Math.random() * 3);
        tmp.x += (Math.random() - 0.5) * 3; tmp.y += Math.random() * 2.5; tmp.z += (Math.random() - 0.5) * 3;
        sparkVel[i * 3] = tmp.x; sparkVel[i * 3 + 1] = tmp.y; sparkVel[i * 3 + 2] = tmp.z;
        sparkLife[i] = 0.35;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    explosion(point) {
      boom.position.copy(point);
      boom.visible = true;
      boomLife = 0.5;
      boomLight.position.copy(point);
      boomLight.intensity = 60;
    },
    step(dt) {
      let dirty = false;
      for (let i = 0; i < 24; i += 1) {
        if (tracerLife[i] > 0) {
          tracerLife[i] -= dt;
          if (tracerLife[i] <= 0) {
            tracerPos[i * 6 + 3] = tracerPos[i * 6];
            tracerPos[i * 6 + 4] = tracerPos[i * 6 + 1];
            tracerPos[i * 6 + 5] = tracerPos[i * 6 + 2];
            dirty = true;
          }
        }
      }
      if (dirty) tracerGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < 96; i += 1) {
        if (sparkLife[i] > 0) {
          sparkLife[i] -= dt;
          sparkVel[i * 3 + 1] -= 9 * dt;
          sparkPos[i * 3] += sparkVel[i * 3] * dt;
          sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
          if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
        }
      }
      sparkGeo.attributes.position.needsUpdate = true;
      if (boomLife > 0) {
        boomLife -= dt;
        const t = 1 - boomLife / 0.5;
        const s = 0.5 + t * 5;
        boom.scale.setScalar(s);
        boom.material.opacity = Math.max(0, 0.85 * (1 - t));
        boomLight.intensity = Math.max(0, 60 * (1 - t));
        if (boomLife <= 0) { boom.visible = false; boomLight.intensity = 0; }
      }
    },
  };
}
