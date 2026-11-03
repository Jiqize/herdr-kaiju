// Kaiju City 布局的部件分发，由 props() 决定画哪个：
//   city：左上城市沙盘（space = 楼，Agent = 怪兽），见 city.js
//   roster：左下怪兽名册
//   top：顶栏胶囊 + tab 胶囊
//   news：右下怪兽快讯
//   窗格头部：props 带 pane 时

import { View, div } from "gpui-kit";
import { spaces, panes, props, theme } from "herdr";
import { Damage } from "./state.js";
import { city } from "./city.js";

export default class Kaiju extends View {
  init() {
    this.damage = new Damage();
  }

  render(cx) {
    const t = theme();
    if (props()?.pane) return this.paneHeader(t);
    const part = props()?.part;
    if (part === "city") return city(this, t, cx);
    if (part === "roster") return this.roster(t);
    if (part === "top") return this.top(t);
    return div();
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
