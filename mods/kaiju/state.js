// Kaiju City 的纯逻辑：素材路径、昼夜判断、space→楼位映射、楼的损坏程度
import { spaces } from "herdr";
import M from "./manifest.js";

const ASSETS = "mods/kaiju/assets";
const MIN = 60 * 1000;
// 连续 working 多久升一级损坏
export const LIGHT_AFTER = 2 * MIN;
export const HEAVY_AFTER = 8 * MIN;
// 回到 idle 后每级修复间隔
export const REPAIR_STEP = 650;

// 主题背景色偏暗 → 夜景素材
export function isNight(t) {
  const hex = (t.background ?? "#ffffff").slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

export const asset = (t, name) => `${ASSETS}/${isNight(t) ? "night" : "day"}/${name}`;

// space 按顺序占前 8 个楼位；之后的不上沙盘
export function slotOf(spaceId) {
  const i = spaces().findIndex((s) => s.id === spaceId);
  return i >= 0 && i < M.slots.length ? i : null;
}

export const slotColor = (i) => (i != null && M.slots[i] ? M.slots[i].color : "#9b958c");

// space 里最早开始 working 的时间
const workingSince = (s) => {
  const ts = s.tabs.map((t) => t.working_since).filter((v) => v != null);
  return ts.length ? Math.min(...ts) : null;
};

// 按 space 状态算出「应有」的损坏程度：working 按时长 0/1/2，done = 3（废墟），
// blocked 保持现状，idle / 无 Agent 目标为 0（由 Damage 逐级修复）
function target(s, now, prev) {
  if (s.status === "done") return 3;
  if (s.status === "blocked") return prev;
  if (s.status === "working") {
    const since = workingSince(s);
    const e = since == null ? 0 : now - since;
    return e >= HEAVY_AFTER ? 2 : e >= LIGHT_AFTER ? 1 : 0;
  }
  return 0;
}

// 每个 space 当前的损坏程度；需要随时间变化时用一次性 timer.after 唤醒重绘（不用 every）
export class Damage {
  constructor() {
    this.level = new Map();
    this.wakeAt = Infinity;
  }

  // 返回 Map<spaceId, 0..3>，并按需预约下一次重绘
  update(cx) {
    const now = Date.now();
    let next = Infinity;
    const live = new Set();
    for (const s of spaces()) {
      live.add(s.id);
      const prev = this.level.get(s.id) ?? 0;
      const want = target(s, now, prev);
      let cur = want;
      if (want < prev && s.status !== "working") {
        // 修复：一级一级降，每级 REPAIR_STEP
        const at = this.repairAt?.get(s.id);
        if (at == null) {
          (this.repairAt ??= new Map()).set(s.id, now + REPAIR_STEP);
          cur = prev;
        } else if (now >= at) {
          cur = prev - 1;
          if (cur > want) this.repairAt.set(s.id, now + REPAIR_STEP);
          else this.repairAt.delete(s.id);
        } else {
          cur = prev;
        }
        if (cur > want) next = Math.min(next, this.repairAt.get(s.id));
      } else {
        this.repairAt?.delete(s.id);
      }
      if (s.status === "working") {
        const since = workingSince(s);
        if (since != null) {
          if (now - since < LIGHT_AFTER) next = Math.min(next, since + LIGHT_AFTER);
          else if (now - since < HEAVY_AFTER) next = Math.min(next, since + HEAVY_AFTER);
        }
      }
      this.level.set(s.id, cur);
    }
    for (const id of [...this.level.keys()]) if (!live.has(id)) this.level.delete(id);
    // 只在比已预约的更早时才再预约一次
    if (next < Infinity && next < this.wakeAt) {
      this.wakeAt = next;
      cx.timer.after(Math.max(16, next - now + 20), (cx) => {
        this.wakeAt = Infinity;
        cx.notify();
      });
    }
    return this.level;
  }
}
