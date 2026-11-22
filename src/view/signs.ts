// Original, runtime-drawn notices for this fictional sento. The boards are
// fixed to world surfaces, depth-tested and independent of control-help settings.
import * as THREE from "three";
import type { Level } from "../level/layout";
import type { Vec3 } from "./deriveView";

type Pictogram = "towel" | "walk" | "quiet" | "clothes" | "none";
export interface SentoSign {
  id: string;
  title: string;
  lines: readonly string[];
  icon: Pictogram;
  position: Vec3;
  /** Plane front points along +Z at zero, +X at PI/2. */
  yaw: number;
  width: number;
  height: number;
  color: string;
}

/** Placements use the same openings and wall faces as the authored environment. */
export function sentoSigns(level: Level): SentoSign[] {
  const door = (id: string) => level.doors.find(d => d.id === id)!.box;
  const changing = door("bath_changing");
  const sauna = door("bath_sauna");
  const reception = door("changing_reception");
  const tub = level.zones.find(z => z.id === "bathwater")!.box;
  const screen = level.fixtures.find(f => f.kind === "screen")!.box;
  const women = level.womensEntrance.doorway;
  return [
    { id: "dry-before-changing", title: "脱衣所へ戻る前に", lines: ["からだを", "拭きましょう"], icon: "towel",
      position: { x: changing.maxX + .47, y: 1.55, z: changing.maxZ + .025 }, yaw: 0,
      width: .72, height: .92, color: "#236c78" },
    { id: "dry-before-sauna", title: "サウナに入る前に", lines: ["からだを", "拭きましょう", "室内は静かに・押さずに"], icon: "towel",
      position: { x: sauna.minX - .025, y: 1.55, z: sauna.maxZ + .52 }, yaw: -Math.PI / 2,
      width: .72, height: .92, color: "#236c78" },
    { id: "sauna-manners", title: "サウナのお約束", lines: ["静かに・押さずに", "具合が悪いときは", "周りに知らせてください"], icon: "quiet",
      position: { x: sauna.maxX + 1, y: 1.55, z: .125 }, yaw: 0,
      width: .8, height: .92, color: "#815339" },
    { id: "walk-in-bath", title: "すべりやすい床", lines: ["走らず", "ゆっくり歩こう"], icon: "walk",
      position: { x: level.soaps[0]!.pos.x, y: 1.84, z: changing.maxZ + .055 }, yaw: 0,
      width: .72, height: .86, color: "#9a5a20" },
    { id: "towel-out-of-water", title: "みんなのお湯", lines: ["タオルは", "湯船の外へ"], icon: "towel",
      // East of the Fuji mural, which occupies x=5.275..9.925 on the rear wall.
      position: { x: tub.maxX - .1, y: 1.55, z: 8.875 }, yaw: Math.PI,
      width: .72, height: .92, color: "#236c78" },
    { id: "dress-before-reception", title: "受付へ出る前に", lines: ["お着替えを", "お忘れなく"], icon: "clothes",
      position: { x: screen.maxX + .025, y: 1.55, z: -3.65 }, yaw: Math.PI / 2,
      width: .76, height: .92, color: "#815339" },
    // Small architectural plaques beside the noren: wayfinding, not floating labels.
    { id: "mens-bath", title: "男 湯", lines: [], icon: "none",
      position: { x: reception.minX - .5, y: 1.75, z: reception.minZ - .025 }, yaw: Math.PI,
      width: .7, height: .24, color: "#244a77" },
    { id: "womens-bath", title: "女 湯", lines: [], icon: "none",
      position: { x: women.maxX + .025, y: 1.75, z: women.minZ - .5 }, yaw: Math.PI / 2,
      width: .7, height: .24, color: "#9b3a4a" },
  ];
}

/** Rectangular pictograms keep the notice readable without relying on emoji fonts. */
function drawPictogram(ctx: CanvasRenderingContext2D, icon: Pictogram, color: string): void {
  ctx.fillStyle = color;
  if (icon === "towel") {
    ctx.fillRect(168, 144, 176, 124);
    ctx.fillStyle = "#fff9e9";
    ctx.fillRect(180, 157, 152, 8);
    ctx.fillRect(180, 242, 152, 8);
    ctx.fillStyle = color;
    for (let x = 174; x < 344; x += 22) ctx.fillRect(x, 267, 10, 16);
  } else if (icon === "walk") {
    // Two soles pointing in the walking direction.
    ctx.fillRect(174, 151, 58, 84);
    ctx.fillRect(181, 248, 44, 28);
    ctx.fillRect(278, 186, 58, 84);
    ctx.fillRect(285, 283, 44, 28);
  } else if (icon === "quiet") {
    // Quiet-face symbol: head, eyes and finger held at the mouth.
    ctx.fillRect(188, 144, 136, 126);
    ctx.fillStyle = "#fff9e9";
    ctx.fillRect(213, 179, 14, 14);
    ctx.fillRect(285, 179, 14, 14);
    ctx.fillRect(246, 209, 20, 78);
  } else if (icon === "clothes") {
    // Shirt silhouette, with sleeves and collar.
    ctx.fillRect(192, 157, 128, 136);
    ctx.fillRect(145, 157, 48, 57);
    ctx.fillRect(319, 157, 48, 57);
    ctx.fillStyle = "#fff9e9";
    ctx.fillRect(235, 157, 42, 24);
  }
}

function signTexture(sign: SentoSign): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = sign.icon === "none" ? 176 : 640;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff9e9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = sign.color;
  ctx.fillRect(16, 16, 480, sign.icon === "none" ? 144 : 88);
  ctx.fillStyle = "#fff9e9";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${sign.icon === "none" ? 76 : 40}px system-ui, "Hiragino Sans", sans-serif`;
  ctx.fillText(sign.title, 256, sign.icon === "none" ? 88 : 60, 448);
  if (sign.icon !== "none") {
    drawPictogram(ctx, sign.icon, sign.color);
    ctx.fillStyle = "#253c3d";
    sign.lines.forEach((line, i) => {
      ctx.font = `bold ${i < 2 && line.length <= 8 ? 54 : 34}px system-ui, "Hiragino Sans", sans-serif`;
      ctx.fillText(line, 256, 363 + i * 72, 454);
    });
    ctx.fillStyle = sign.color;
    ctx.font = '26px system-ui, "Hiragino Sans", sans-serif';
    ctx.fillText("当浴場からのお願い", 256, 602, 448);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** No billboard rotation, screen-size scaling or depth override is applied. */
export function createSentoSigns(level: Level): THREE.Group {
  const group = new THREE.Group();
  group.name = "sento_wall_notices";
  for (const spec of sentoSigns(level)) {
    const board = new THREE.Group();
    board.name = `sign_${spec.id}`;
    board.position.set(spec.position.x, spec.position.y, spec.position.z);
    board.rotation.y = spec.yaw;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width + .035, spec.height + .035, .025),
      new THREE.MeshStandardMaterial({ color: 0x795638, roughness: .9 }),
    );
    const face = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.height),
      new THREE.MeshBasicMaterial({ map: signTexture(spec), toneMapped: false, depthTest: true, depthWrite: true }));
    face.name = "printed_notice";
    face.position.z = .013;
    board.add(frame, face);
    group.add(board);
  }
  return group;
}
