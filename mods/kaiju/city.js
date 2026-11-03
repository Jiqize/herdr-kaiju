// 城市沙盘：底座 + 8 个楼位（space = 楼）+ 怪兽（Agent），当前楼顶浮动箭头
//   点楼切换 space，点怪兽跳到它的窗格
import { div, image } from "gpui-kit";
import { spaces, agents, setAgentOrder, run, props } from "herdr";
import M from "./manifest.js";
import { asset, assign, behaviors, monsterOf, STATUS_TEXT } from "./state.js";

const W = M.canvas.w;
const H = M.canvas.h;
const SP = M.sprite;
const RISE = 40;
const WALK = 900;

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

// 位置变了的怪兽在移动途中显示走路帧，到达后（一次 timer.after）换回目标帧
function walking(view, list, beh, cx) {
  const w = (view.walk ??= new Map());
  const now = Date.now();
  let wake = 0;
  for (const a of list) {
    const b = beh.get(a.address);
    const last = w.get(a.address);
    if (last && (last.x !== b.spot.x || last.y !== b.spot.y)) {
      last.until = now + WALK;
      wake = WALK + 20;
    }
    w.set(a.address, { x: b.spot.x, y: b.spot.y, until: last?.until ?? 0 });
  }
  for (const k of [...w.keys()]) if (!beh.has(k)) w.delete(k);
  if (wake) cx.timer.after(wake, (cx) => cx.notify());
  return (addr) => (w.get(addr)?.until ?? 0) > now;
}

// props().demo.agents：截图检查用的假 Agent，[{address, space: 序号, status, name}]
function agentList() {
  const demo = props()?.demo?.agents;
  if (!demo) return agents();
  const sp = spaces();
  return demo.map((d) => ({
    address: d.address, pane: null, status: d.status, focused: false,
    space: sp[d.space]?.id ?? "", program: { name: d.name ?? "agent" },
  }));
}

function monster(t, a, b, mid, isWalking) {
  const m = monsterOf(mid);
  const frame = isWalking ? "walk" : b.mode === "swim" ? "swim" : b.mode;
  let body = div().id(`mon-body-${a.address}`).absolute().left(0).top(0).w(SP.w).h(SP.h)
    .child(image(asset(t, m.frames[frame])).w(SP.w).h(SP.h));
  if (!isWalking && b.mode === "smash") body = body.loop("left", { from: -1, to: 1, period: 180 });
  if (!isWalking && b.mode === "swim") body = body.loop("top", { from: 0, to: 2, period: 1600 });
  const el = div().id(`mon-${a.address}`).absolute().left(b.spot.x - SP.ax).top(b.spot.y - SP.ay).w(SP.w).h(SP.h)
    .transition("left", { duration: WALK, easing: "ease-in-out" })
    .transition("top", { duration: WALK, easing: "ease-in-out" })
    .child(body);
  if (b.bubble && !isWalking) {
    const [bw, bh] = M.fxSize[b.bubble];
    const top = (b.mode === "swim" ? SP.h - Math.round((SP.h - m.top) * 0.55) : m.top) - bh;
    let bub = div().absolute().left(SP.ax + 14).top(top - 2).child(fx(t, b.bubble));
    if (b.mode === "swim") bub = bub.id(`zz-${a.address}`).loop("opacity", { from: 0.35, to: 1, period: 1600 });
    el.child(bub);
  }
  return el;
}

export function city(view, t, cx) {
  const list = spaces();
  const demo = props()?.demo;
  const ags = agentList();
  const level = demo?.damage ? null : view.damage.update(cx, ags);
  const up = rising(view, list, cx);
  const dmgOf = (sp, s) => (demo?.damage ? demo.damage[s.i] ?? 0 : level.get(sp.id) ?? 0);

  if (!demo?.agents) setAgentOrder(ags.map((a) => a.address));
  const mids = assign(ags);
  const beh = behaviors(ags);
  const isWalking = walking(view, ags, beh, cx);
  // 每个楼位前的怪兽状态：有拆楼的 → 楼震动 + 烟尘；有等你的 → 楼顶警报灯
  const smashing = new Set();
  const waiting = new Set();
  for (const a of ags) {
    const b = beh.get(a.address);
    if (b.slot == null || isWalking(a.address)) continue;
    if (b.mode === "smash") smashing.add(b.slot);
    if (b.mode === "wave") waiting.add(b.slot);
  }

  // 楼按 depth 从后往前叠；怪兽一律画在所有楼之上（后排楼前的怪兽也不被前排楼挡住），彼此按 depth 排
  const items = [];
  for (const s of M.slots) items.push({ depth: s.depth, order: 0, slot: s });
  for (const a of ags) items.push({ depth: beh.get(a.address).spot.depth, order: 1, agent: a });
  items.sort((x, y) => x.order - y.order || x.depth - y.depth);

  const stage = div().relative().w(W).h(H).child(layer(t, "plate.png"));
  for (const it of items) {
    if (it.agent) {
      const a = it.agent;
      stage.child(monster(t, a, beh.get(a.address), mids.get(a.address), isWalking(a.address)));
      continue;
    }
    const s = it.slot;
    const sp = list[s.i];
    if (!sp) {
      stage.child(layer(t, s.empty));
      continue;
    }
    const dmg = dmgOf(sp, s);
    // 楼裁在自己底边以上，升起时不会露到地面下方
    const bottom = s.hit.y + s.hit.h;
    let img = image(asset(t, s.layers[dmg])).absolute().left(0).w(W).h(H)
      .top(up.has(sp.id) ? RISE : 0).spring("top", { response: 520, damping: 0.62 });
    let box = div().id(`bld-${s.i}`).absolute().left(0).top(0).w(W).h(bottom).overflow_hidden();
    if (smashing.has(s.i)) box = box.loop("left", { from: 0, to: 1, period: 240 });
    stage.child(box.child(img));
    if (smashing.has(s.i)) {
      const [dw, dh] = M.fxSize.dust;
      stage.child(div().id(`dust-${s.i}`).absolute().left(s.hit.x + s.hit.w / 2 - dw / 2).top(bottom - dh - 2)
        .loop("opacity", { from: 0.4, to: 1, period: 700 }).child(fx(t, "dust")));
    }
    if (waiting.has(s.i)) {
      const [sw, sh] = M.fxSize.siren;
      stage.child(div().id(`siren-${s.i}`).absolute().left(s.roof.x - sw / 2).top(s.roofs[dmg] - sh - 1)
        .loop("opacity", { from: 0.2, to: 1, period: 500 }).child(fx(t, "siren")));
    }
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

  // 点击区域：楼按 depth 从后往前叠，前面的楼优先；怪兽的点击区域在楼之上
  const stop = (_e, cx) => cx.stop_propagation();
  for (const s of [...M.slots].sort((a, b) => a.depth - b.depth)) {
    const sp = list[s.i];
    if (!sp) continue;
    stage.child(div().id(`hit-${s.i}`).absolute().left(s.hit.x).top(s.hit.y).w(s.hit.w).h(s.hit.h)
      .cursor_pointer().tooltip(sp.name)
      .on_mouse_down("left", stop)
      .on_click(() => run("space.select", { id: sp.id })));
  }
  for (const a of ags) {
    const b = beh.get(a.address);
    const m = monsterOf(mids.get(a.address));
    const h = b.mode === "swim" ? 26 : SP.h - m.top;
    stage.child(div().id(`mhit-${a.address}`).absolute().left(b.spot.x - 18).top(b.spot.y - h).w(36).h(h)
      .cursor_pointer().tooltip(`${m.name} · ${a.program?.name ?? a.app ?? "Agent"} · ${STATUS_TEXT[a.status] ?? ""}`)
      .on_mouse_down("left", stop)
      .on_click(() => a.pane && run("pane.focus", { pane: a.pane })));
  }
  return div().size_full().flex().justify_center().pt(8).child(stage);
}
