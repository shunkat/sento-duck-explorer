// Japanese UI strings. Rules shown here belong to this fictional facility;
// they are not presented as rules shared by every sento.
import type { CharacterId, ViolationId } from "./types";

export const CHARACTER_NAME: Record<CharacterId, string> = {
  duck: "アヒル",
  child: "子ども",
  adult: "大人",
};

export const VIOLATION_TEXT: Record<ViolationId, { reason: string; manner: string; speech?: { speaker: string; line: string } }> = {
  F1: { reason: "タオルをお風呂につけてしまった", manner: "タオルは湯船に入れず、頭にのせるか湯船の外に置こう" },
  F2: { reason: "体を拭かずに更衣室に入ってしまった", manner: "浴室を出る前にタオルで体を拭こう" },
  F3: { reason: "走って石鹸を踏んでしまった", manner: "浴室は滑りやすいので歩こう" },
  F4: { reason: "裸のまま更衣室から出てしまった", manner: "受付や館内へ出る前に服を着よう" },
  F5: { reason: "体を拭かずにサウナ室に入ってしまった", manner: "サウナに入る前に体を拭こう" },
  F6: { reason: "サウナ室で大声を出してしまった", manner: "サウナでは静かに。具合が悪い時や異変は、すぐ周りや従業員に知らせよう" },
  F7: { reason: "サウナ室で人を押しのけてしまった", manner: "押さずに、通れるすき間をゆっくり進もう" },
  F8: {
    reason: "女湯の入口に入ろうとしてしまった",
    manner: "入口ののれんを見て、男湯の入口から入ろう",
    speech: { speaker: "受付の人", line: "こら、そちらは女湯です！男湯はあちらですよ！" },
  },
};

export const ITEM_TEXT = {
  coin: "家族が落とした500円玉（このゲームの施設のサウナ代）",
  key: "親子で使えるサウナ室の鍵（このゲームの施設のルール）",
  hat: "支払った家族が借りられるアヒル用サウナハット",
} as const;

export const MSG = {
  nothingHere: "ここではできることがありません",
  needCoin: "500円玉が必要です",
  moveTogether: (other: CharacterId) => `${CHARACTER_NAME[other]}と一緒に移動しましょう`,
  companionDry: (other: CharacterId) => `${CHARACTER_NAME[other]}も出口の前でEを押して体を拭きましょう（Tabで切り替え）`,
  companionDress: (other: CharacterId) => `${CHARACTER_NAME[other]}に服を着せましょう`,
  needBothAtShore: "子どもと一緒に池のほとり（庭）まで来ましょう",
  shoutOutsideSauna: "大声は周りの迷惑になります",
  cannotPutDuckHere: "ここではアヒルを下ろせません。湯船か水路のそばでEを押そう",
  towelOnHead: "タオルは頭の上にあります（Eで手に持てます）",
  duckStepTooHigh: "段差が高くて、アヒルでは越えられない",
} as const;

export const ZONE_NAME: Record<import("./types").ZoneId, string> = {
  bath: "浴室",
  bathwater: "湯船",
  splash: "かけ湯",
  narrow_hole: "小さな穴",
  changing: "更衣室",
  reception: "受付",
  common: "ロビー（休憩所）",
  exterior: "玄関（下足箱）",
  sauna_entry: "サウナ室（入口）",
  sauna_crowd: "サウナ室（座っている人たち）",
  open_air: "露天風呂",
  pond_entrance: "庭（池のほとり）",
  pond: "秘密の池",
  pond_goal: "池の奥（ゴール）",
};

export const NODE_NAME: Record<import("./types").NodeId, string> = {
  narrow_hole_coin: "小さな穴の奥",
  reception_desk: "受付台",
  reception_register: "受付（支払い済み）",
  sauna_hat_shelf: "サウナの棚",
};

export const ITEM_NAME = { coin: "500円玉", key: "サウナの鍵", hat: "サウナハット" } as const;

export const CHECKPOINT_NAME: Record<import("./types").CheckpointId, string> = {
  start: "スタート",
  paidReturned: "支払い後に浴室へ戻った所",
  hatEquipped: "帽子を被せた所",
  duckInPond: "アヒルを池に置いた所",
};
