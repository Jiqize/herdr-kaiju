// Kaiju City 布局的部件分发，由 props() 决定画哪个：
//   city：左上城市沙盘（space = 楼，Agent = 怪兽）
//   roster：左下怪兽名册
//   top：顶栏胶囊 + tab 胶囊
//   news：右下怪兽快讯
//   窗格头部：props 带 pane 时

import { View, div, image } from "gpui-kit";
import { spaces, panes, props, theme } from "herdr";
import M from "./manifest.js";

const ASSETS = "mods/kaiju/assets";

// 主题背景色偏暗 → 夜景素材
export function isNight(t) {
  const hex = (t.background ?? "#ffffff").slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}

export const asset = (t, name) => `${ASSETS}/${isNight(t) ? "night" : "day"}/${name}`;

// 沙盘里的一张全画布图层（320×300 逻辑像素）
const layer = (t, name) => image(asset(t, name)).absolute().left(0).top(0).w(M.canvas.w).h(M.canvas.h);

export default class Kaiju extends View {
  render() {
    const t = theme();
    if (props()?.pane) return this.paneHeader(t);
    const part = props()?.part;
    if (part === "city") return this.city(t);
    if (part === "roster") return this.roster(t);
    if (part === "top") return this.top(t);
    return div();
  }

  // ---------- 城市沙盘（骨架：底座 + 已有 space 的楼） ----------
  city(t) {
    const n = Math.min(spaces().length, M.slots.length);
    const slots = [...M.slots].sort((a, b) => a.depth - b.depth);
    const stage = div().relative().w(M.canvas.w).h(M.canvas.h).child(layer(t, "plate.png"));
    for (const s of slots) stage.child(layer(t, s.i < n ? s.layers[0] : s.empty));
    return div().size_full().flex().justify_center().pt(8).child(stage);
  }

  roster(t) {
    return div().size_full().px(14).py(8).flex().flex_col().gap(6)
      .child(div().text_size(12).text_color(t.dim).child("怪兽名册"))
      .children(spaces().map((s) => div().text_size(12).text_color(t.foreground).child(s.name)));
  }

  top(t) {
    const s = spaces().find((x) => x.active) ?? spaces()[0];
    return div().size_full().flex().items_center().justify_center()
      .child(div().text_size(12).text_color(t.foreground).child(s?.name ?? ""));
  }

  paneHeader(t) {
    const p = panes().find((x) => x.pane === props().pane);
    return div().size_full().flex().items_center().px(10).text_size(12).text_color(t.muted)
      .child(p?.title ?? "");
  }
}
