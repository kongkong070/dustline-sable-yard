// Sable Yard: an original dusk-desert freight yard, 56 x 44 m. Three lanes run
// north from the attackers' spawn (south) to the defenders' yard (north): A Long
// down the west wall, Mid through the container canyon, B Long down the east wall.
// Bomb sites A (north-west) and B (north-east) are marked in hazard amber. Every
// box is a collider for players and bots and a surface a bullet stops on; the
// waypoint graph at the bottom is what the bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'A', center: new THREE.Vector3(-17, 0, -12), radius: 4.6 },
  B: { name: 'B', center: new THREE.Vector3(17, 0, -12), radius: 4.6 },
};

// Waypoints: id -> [x, z, neighbour ids]. Lanes, corners and site holds.
export const WAYPOINTS = [
  [0, 0, 17, [1, 2, 3]], // attacker spawn
  [1, -18, 12, [0, 4, 8]], // A long entry
  [2, 0, 10, [0, 5, 9]], // mid entry
  [3, 18, 12, [0, 6, 10]], // B long entry
  [4, -20, 2, [1, 7, 11]], // A long mid
  [5, 0, 2, [2, 7, 8, 9]], // mid canyon
  [6, 20, 2, [3, 8, 12]], // B long mid
  [7, -14, -4, [4, 5, 13]], // A connector
  [8, 14, -4, [5, 6, 14]], // B connector
  [9, -6, -6, [5, 13]], // mid north-west
  [10, 6, -6, [5, 14]], // mid north-east
  [11, -20, -8, [4, 13]], // A site approach
  [12, 20, -8, [6, 14]], // B site approach
  [13, -17, -12, [7, 9, 11, 15]], // site A
  [14, 17, -12, [8, 10, 12, 16]], // site B
  [15, -10, -16, [13, 16]], // defender back A
  [16, 10, -16, [14, 15]], // defender back B
  [17, -24, -14, [13]], // A corner hold
  [18, 24, -14, [14]], // B corner hold
  [19, 0, -14, [15, 16]], // defender mid hold
  [20, -8, 8, [1, 2]], // attacker A-side staging
  [21, 8, 8, [2, 3]], // attacker B-side staging
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.5 : name === 'rust' ? 0.75 : 0.92,
      metalness: name === 'rust' ? 0.35 : 0.03,
    });
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Ground and perimeter, 56 x 44 m, 5 m walls.
  box(56.4, 0.4, 44.4, 0, -0.2, 0, 'surface');
  box(0.4, 5, 44.4, -28.2, 2.5, 0, 'surface');
  box(0.4, 5, 44.4, 28.2, 2.5, 0, 'surface');
  box(56.4, 5, 0.4, 0, 2.5, -22.2, 'surface');
  box(56.4, 5, 0.4, 0, 2.5, 22.2, 'surface');

  // Mid canyon walls: two long walls leave a 4 m gap at z = 2 (the mid door).
  box(0.6, 3.4, 12, -5, 1.7, -2, 'hairline');
  box(0.6, 3.4, 12, 5, 1.7, -2, 'hairline');
  box(10.6, 3.4, 0.6, 0, 1.7, -8, 'hairline');
  // A/B lane dividers with peek gaps.
  box(0.6, 3.2, 10, -11, 1.6, 4, 'hairline');
  box(0.6, 3.2, 10, 11, 1.6, 4, 'hairline');
  box(0.6, 3.2, 8, -11, 1.6, -10, 'hairline');
  box(0.6, 3.2, 8, 11, 1.6, -10, 'hairline');

  // Freight containers: rust stacks that make the lanes and the sites.
  box(6, 2.6, 2.6, -21, 1.3, -4, 'rust');
  box(6, 2.6, 2.6, -21, 1.3, 6, 'rust');
  box(2.6, 2.6, 6, -14, 1.3, -16, 'rust');
  box(6, 2.6, 2.6, 21, 1.3, -4, 'rust');
  box(6, 2.6, 2.6, 21, 1.3, 6, 'rust');
  box(2.6, 2.6, 6, 14, 1.3, -16, 'rust');
  box(4.4, 2.6, 2.4, -24, 1.3, -17, 'rust');
  box(4.4, 2.6, 2.4, 24, 1.3, -17, 'rust');
  box(5, 2.6, 2.4, 0, 1.3, -19, 'rust');
  // Double-stacked container over mid-north, a landmark sightline.
  box(6, 2.6, 2.6, -2, 1.3, -13, 'rust');
  box(6, 2.6, 2.6, -2, 3.9, -13, 'rust');

  // Crates: crouch cover scattered on every lane.
  const crates = [
    [-16, 8, 1.2], [-8, 13, 1.0], [8, 13, 1.0], [16, 8, 1.2],
    [-17, -6, 1.1], [17, -6, 1.1], [-4, -3, 1.0], [4, -3, 1.0],
    [-13, -11, 1.1], [13, -11, 1.1], [0, 8, 1.2], [-24, 0, 1.0], [24, 0, 1.0],
  ];
  for (const [x, z, s] of crates) box(s, s, s, x, s / 2, z, 'hairline');
  // Low scrub bushes (visual cover at ankle height, no collision).
  for (const [x, z] of [[-25, 10], [25, -10], [-6, 18], [12, -18], [-22, -19]]) {
    box(1.4, 0.5, 1.4, x, 0.25, z, 'sage', false);
  }

  // Bomb-site markers: amber floor strips and a beacon pole each.
  for (const site of Object.values(SITES)) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(site.radius * 2, 0.06, 0.5), glowMat);
    strip.position.set(site.center.x, 0.03, site.center.z + site.radius);
    group.add(strip);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), materials.rust);
    pole.position.set(site.center.x + site.radius, 1.7, site.center.z - site.radius);
    pole.castShadow = true;
    group.add(pole);
    colliders.push(new THREE.Box3().setFromObject(pole));
    shootables.push(pole);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 6, 12);
    lamp.position.set(site.center.x, 3.6, site.center.z);
    group.add(lamp);
  }

  // Distant silos beyond the north wall: skyline only, out of play.
  for (const x of [-18, -6, 8, 20]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 11, 12), materials.rust);
    silo.position.set(x, 5.5, -30);
    group.add(silo);
  }

  // Light: low dusk sun from the west, cool sky fill, warm site lamps above.
  // The hemisphere is strong on purpose: shadowed ground must still read.
  const sky = new THREE.HemisphereLight(new THREE.Color('#9a8a72'), new THREE.Color(PALETTE.canvas), 1.7);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.0);
  sun.position.set(-22, 16, 12);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.85);
  fill.position.set(14, 10, 16);
  scene.add(fill);

  return { colliders, shootables, group };
}
