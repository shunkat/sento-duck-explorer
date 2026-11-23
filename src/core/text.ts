// Japanese UI strings. Rules shown here belong to this fictional facility;
// they are not presented as rules shared by every sento.
import type { CharacterId, CheckpointId, MilkId, Stage, ViolationId, ZoneId } from "./types";

/** Names of the three growth stages. */
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

export const MSG = {
  nothingHere: "ここではできることがありません",
  milkWrongStage: (needs: Stage) => `この牛乳びんは${CHARACTER_NAME[needs]}のときに飲めます`,
  guardianAsked: "いっしょにサウナへ行こう。入口で体を拭いてから入ろう。",
  guardianNeeded: "サウナへは大人といっしょに入ろう。見守りの大人にお願いしてね。",
  guardianWait: "大人がサウナの入口に来るまで待とう。",
  handleTooHigh: "取っ手が高くて届かない（大人になったら開けられる）",
  shoutOutsideSauna: "大声は周りの迷惑になります",
  towelOnHead: "タオルは頭の上にあります（手に持つ操作で持てます）",
  duckStepTooHigh: "段差が高くて、アヒルでは越えられない",
  grew: (to: Stage) => `牛乳を飲んで${CHARACTER_NAME[to]}に育った！`,
} as const;

export const ZONE_NAME: Record<ZoneId, string> = {
  bath: "浴室",
  bathwater: "湯船",
  splash: "かけ湯",
  narrow_hole: "小さな穴",
  kids_pool: "浅い湯だまり",
  kids_passage: "子ども用の通り道",
  kids_room: "広い休憩所",
  changing: "更衣室",
  reception: "受付",
  common: "ロビー（休憩所）",
  genkan: "玄関（下足箱）",
  street: "外",
  sauna_entry: "サウナ室（入口）",
  sauna_crowd: "サウナ室（座っている人たち）",
  open_air: "露天風呂",
  pond_entrance: "庭（池のほとり）",
  pond: "池",
};

export const MILK_NAME: Record<MilkId, string> = {
  milk1: "牛乳びん（湯船）", milk2: "牛乳びん（浅い湯だまり）",
  milk3: "牛乳びん（サウナ）", milk4: "牛乳びん（露天風呂）",
};

export const CHECKPOINT_NAME: Record<CheckpointId, string> = {
  start: "スタート",
  duckMilkFound: "アヒルで牛乳を1本飲んだ所",
  childGrown: "子どもに育った所",
  escortJoined: "大人に同行をお願いした所",
  childMilkFound: "子どもで牛乳を1本飲んだ所",
  adultGrown: "大人に育った所",
};
