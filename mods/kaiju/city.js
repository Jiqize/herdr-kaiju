// 城市沙盘：底座 + 8 个楼位（space = 楼），当前楼顶浮动箭头，点楼切换 space
import { div, image } from "gpui-kit";
import { spaces, run, props } from "herdr";
import M from "./manifest.js";
import { asset } from "./state.js";

const W = M.canvas.w;
const H = M.canvas.h;
const RISE = 40;

// 一张全画布图层
const layer = (t, name) => image(asset(t, name)).absolute().left(0).top(0).w(W).h(H);

const fx = (t, name) => {
  const [w, h] = M.fxSize[name];
  return image(asset(t, M.fx[name])).w(w).h(h);
};

// 记录见过的 space：新出现的楼从地面升起（第一次渲染时已有的不算）
function rising(view, list, cx) {
  const c = (view.city ??= { known: null, rising: new Set() });
  const ids = list.map((s) => s.id);
  if (c.known == null) {
    c.known = new Set(ids);
    return c.rising;
  }
  const fresh = ids.filter((id) => !c.known.has(id));
  if (fresh.length) {
    fresh.forEach((id) => { c.known.add(id); c.rising.add(id); });
    // 先画在低处，下一帧回到原位，spring 带出升起
    cx.timer.after(40, (cx) => { c.rising.clear(); cx.notify(); });
  }
  for (const id of [...c.known]) if (!ids.includes(id)) c.known.delete(id);
  return c.rising;
}

export function city(view, t, cx) {
  const list = spaces();
  // props().demo.damage：截图检查用，强制各楼损坏程度
  const demo = props()?.demo;
  const level = demo?.damage ? null : view.damage.update(cx);
  const up = rising(view, list, cx);
  const slots = [...M.slots].sort((a, b) => a.depth - b.depth);
  const dmgOf = (sp, s) => (demo?.damage ? demo.damage[s.i] ?? 0 : level.get(sp.id) ?? 0);

  const stage = div().relative().w(W).h(H).child(layer(t, "plate.png"));
  for (const s of slots) {
    const sp = list[s.i];
    if (!sp) {
      stage.child(layer(t, s.empty));
      continue;
    }
    const dmg = dmgOf(sp, s);
    // 楼裁在自己底边以上，升起时不会露到地面下方
    const bottom = s.hit.y + s.hit.h;
    stage.child(div().id(`bld-${s.i}`).absolute().left(0).top(0).w(W).h(bottom).overflow_hidden()
      .child(image(asset(t, s.layers[dmg])).absolute().left(0).w(W).h(H)
        .top(up.has(sp.id) ? RISE : 0).spring("top", { response: 520, damping: 0.62 })));
  }

  // 当前 space 楼顶上方的浮动箭头
  const cur = list.findIndex((s) => s.active);
  if (cur >= 0 && cur < M.slots.length) {
    const s = M.slots[cur];
    const [aw, ah] = M.fxSize.arrow;
    const roofY = s.roofs[dmgOf(list[cur], s)];
    stage.child(div().id("kaiju-arrow-at").absolute().left(s.roof.x - aw / 2).top(roofY - 12 - ah).w(aw).h(ah)
      .transition("top", { duration: 400, easing: "ease-out" })
      .child(div().id("kaiju-arrow").absolute().left(0).top(0)
        .loop("top", { from: -3, to: 3, period: 900 })
        .child(fx(t, "arrow"))));
  }

  // 点击区域：按 depth 从后往前叠，前面的楼优先接住点击
  for (const s of slots) {
    const sp = list[s.i];
    if (!sp) continue;
    stage.child(div().id(`hit-${s.i}`).absolute().left(s.hit.x).top(s.hit.y).w(s.hit.w).h(s.hit.h)
      .cursor_pointer().tooltip(sp.name)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: sp.id })));
  }
  return div().size_full().flex().justify_center().pt(8).child(stage);
}
