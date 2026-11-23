// The actual render method must consume the camera's mobile metadata before
// projecting feedback. No GPU is needed to check projection and material state.
import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { LEVEL } from "../src/level/layout";
import { GameScene } from "../src/view/scene";
import { deriveView } from "../src/view/deriveView";
import type { Pose } from "../src/view/camera";

it("applies mobile projection and active-body fade, and restores both for desktop and overview", () => {
  const view = deriveView(createInitialState(LEVEL), LEVEL);
  const body = () => new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const chars = { duck: body(), child: body(), adult: body() };
  for (const id of ["duck", "child", "adult"] as const) chars[id].position.copy(view.characters[id].pos);
  const ring = body();
  const camera = new THREE.PerspectiveCamera(55, 390 / 844, .05, 200);
  const originalProjection = camera.projectionMatrix.clone();
  const updateProjection = vi.spyOn(camera, "updateProjectionMatrix");
  const feedback = { update: vi.fn(() => "none"), hide: vi.fn() };
  const fixture = {
    setOverview: vi.fn(), chars, rings: { duck: ring },
    bathLighting: { update: vi.fn() },
    items: { milk1: new THREE.Object3D(), milk2: new THREE.Object3D(), milk3: new THREE.Object3D(), milk4: new THREE.Object3D() },
    highDoors: { kidsGate: new THREE.Object3D(), frontExit: new THREE.Object3D() },
    worldEnvironment: { setView() {}, hasGrowthDoors: true, updateDetail() {} },
    growthFallback: new THREE.Group(), environmentModels: { updateDetail() {} },
    camera, feedback, size: new THREE.Vector2(), scene: new THREE.Scene(),
    renderer: { getSize: (v: THREE.Vector2) => v.set(390, 844), render: vi.fn() },
  };
  const pose: Pose = { eye: { x: 7, y: .5, z: 7 }, target: view.focus, fov: 65, activeBodyOpacity: .3 };
  const render = (next: Pose, overview = false) => GameScene.prototype.render.call(
    fixture as unknown as GameScene, view, next, overview,
    { target: null, enabled: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
  );
  feedback.update.mockImplementation(() => {
    expect(camera.fov).toBe(65);
    expect(camera.projectionMatrix.equals(originalProjection)).toBe(false);
    return "none";
  });
  render(pose);
  expect(fixture.renderer.render).toHaveBeenCalledWith(fixture.scene, camera);
  expect(chars.duck.material.opacity).toBe(.3);
  expect(chars.duck.material.transparent).toBe(true);
  expect(chars.duck.material.depthWrite).toBe(false);
  expect(ring.material.opacity).toBe(1);
  expect(updateProjection).toHaveBeenCalledOnce();
  render(pose);
  expect(updateProjection).toHaveBeenCalledOnce();

  render(pose, true);
  expect(camera.fov).toBe(55);
  expect(camera.projectionMatrix.equals(originalProjection)).toBe(true);
  for (const c of Object.values(chars)) expect(c.material.opacity).toBe(1);
  expect(chars.duck.material.transparent).toBe(false);
  expect(chars.duck.material.depthWrite).toBe(true);

  feedback.update.mockImplementation(() => "none");
  render(pose);
  render({ eye: pose.eye, target: pose.target });
  expect(camera.fov).toBe(55);
  expect(chars.duck.material.opacity).toBe(1);
  expect(chars.duck.material.transparent).toBe(false);
});
