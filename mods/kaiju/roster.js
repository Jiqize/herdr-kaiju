// 怪兽名册：按 space 分组，每个 Agent 一张像素描边的横条卡片（48px 怪兽头像 + 名字 + 状态徽章）
// 侧栏收起（< 160px）时改画窄栏：每个 space 一块小楼图标 + 状态灯
import { div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, agents, run, openOverlay, window, layout } from "herdr";
import { asset, assign, monsterOf, slotOf, slotColor, STATUS_TEXT } from "./state.js";

export const WIDE = 400;
export const RAIL = 76;

// 状态 → 头像表情帧
const FACE = { idle: "idle", working: "smash", done: "roar", blocked: "wave" };
// 状态徽章颜色（像素风纯色块）
const BADGE = { working: "#e07a3c", done: "#d9573f", blocked: "#d8a548" };

const hotkey = (i) => (i < 9 ? `⌃${i + 1}` : "");
const stop = (_e, cx) => cx.stop_propagation();

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const sidebarOpen = () => (find(layout(), "sidebar")?.size?.px ?? WIDE) >= 160;

// cmd-b：侧栏 400 ↔ 76，收起时隐藏沙盘块
export function toggleSidebar() {
  if (sidebarOpen()) {
    run("layout.hide", { id: "city" });
    run("layout.resize", { id: "sidebar", px: RAIL });
  } else {
    run("layout.resize", { id: "sidebar", px: WIDE });
    run("layout.show", { id: "city" });
  }
}

const spaceMenu = (s) => (_e, cx) => {
  cx.stop_propagation();
  openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
};

// 楼色小楼图标：楼身 + 2×2 像素窗
function miniBuilding(color, size) {
  const w = Math.round(size * 0.55);
  const h = size;
  const win = div().flex().flex_wrap().gap(2).p(3).w(w).children(
    Array.from({ length: Math.max(2, Math.floor((h - 6) / 4)) * 2 }, () => div().size(2).bg("#00000040")));
  return div().w(w).h(h).bg(color).border(1).border_color("#00000055").overflow_hidden().child(win);
}

function statusLight(t, status) {
  if (!status || status === "idle") return null;
  let d = div().size(8).bg(BADGE[status]).border(1).border_color(t.chrome);
  if (status === "working") d = d.loop("opacity", { from: 0.35, to: 1, period: 1100 });
  return d;
}

function badge(t, status) {
  const text = STATUS_TEXT[status] ?? "睡觉中";
  if (!BADGE[status]) return div().flex_none().px(5).py(1).text_size(12).text_color(t.dim).child(text);
  return div().flex_none().px(5).py(1).text_size(12).bg(BADGE[status]).text_color("#ffffff").child(text);
}

function card(t, a, mid) {
  const m = monsterOf(mid);
  const color = slotColor(slotOf(a.space));
  const face = FACE[a.status] ?? "idle";
  const where = /^(tb)?\d+$/.test(a.tab_name ?? "") ? a.space_name : `${a.space_name} · ${a.tab_name}`;
  let avatar = image(asset(t, m.avatars[face])).w(48).h(48);
  // 拆楼中：头像轻轻抖（原生 loop）
  if (a.status === "working") avatar = div().id(`ava-${a.address}`).loop("left", { from: -1, to: 1, period: 220 }).relative().child(avatar);
  return h_flex().id(`card-${a.address}`).h(64).px(6).gap(10).flex_none().items_center().cursor_pointer()
    .bg(a.focused ? t.selected : t.surface).border(2).border_color(a.focused ? t.input : t.border)
    .hover((st) => st.border_color(t.input))
    .tooltip(`${m.name} · ${a.program?.name ?? a.app ?? "Agent"}`)
    .on_mouse_down("left", stop)
    .on_click(() => run("pane.focus", { pane: a.pane }))
    .child(div().size(52).flex_none().flex().items_center().justify_center().bg(`${color}33`).border(2).border_color(color)
      .overflow_hidden().child(avatar))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(h_flex().items_center().gap(6)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(m.name))
        .child(badge(t, a.status)))
      .child(div().truncate().text_size(12).text_color(t.muted).child(a.program?.name ?? a.app ?? "Agent"))
      .child(div().truncate().text_size(12).text_color(t.dim).child(where)));
}

function spaceHeader(t, s, i) {
  const slot = slotOf(s.id);
  return h_flex().id(`sp-${s.id}`).h(28).px(6).gap(8).flex_none().items_center().cursor_pointer()
    .when(s.active, (el) => el.bg(t.selected))
    .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
    .tooltip(slot == null ? `${s.name}（不在沙盘上）` : s.name)
    .on_mouse_down("left", stop)
    .on_click(() => run("space.select", { id: s.id }))
    .on_mouse_down("right", spaceMenu(s))
    .child(div().size(10).flex_none().bg(slotColor(slot)).border(1).border_color("#00000055"))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(s.name))
    .child(div().flex_none().text_size(12).text_color(t.dim).child(hotkey(i)));
}

const button = (t, id, icon, tip, action) => div().id(id).size(32).flex_none().flex().items_center().justify_center()
  .text_color(t.muted).cursor_pointer().hover((st) => st.bg(t.hover).text_color(t.foreground))
  .tooltip(tip).on_mouse_down("left", stop).on_click(action)
  .child(svg(icon).size(16));

export function roster(view, t) {
  const list = agents();
  const mids = assign(list);
  const w = window();
  const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen;

  if (!sidebarOpen()) {
    const tile = (s, i) => {
      const light = statusLight(t, s.status);
      return div().id(`rail-${s.id}`).relative().size(48).flex_none().flex().items_center().justify_center().cursor_pointer()
        .when(s.active, (el) => el.bg(t.selected).border(2).border_color(t.input))
        .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
        .tooltip(hotkey(i) ? `${s.name}  ${hotkey(i)}` : s.name)
        .on_mouse_down("left", stop)
        .on_click(() => run("space.select", { id: s.id }))
        .on_mouse_down("right", spaceMenu(s))
        .child(miniBuilding(slotColor(slotOf(s.id)), 30))
        .when(Boolean(light), (el) => el.child(div().absolute().top(3).right(3).child(light)));
    };
    return v_flex().size_full().items_center().pt(lights ? 50 : 12).pb(12).gap(6)
      .child(v_flex().id("rail-list").flex_1().min_h(0).w_full().items_center().gap(6).overflow_y_scrollbar()
        .children(spaces().map(tile)))
      .child(button(t, "rail-new", "mods/workspace-chrome/plus.svg", "新建 space", () => run("space.new")))
      .child(button(t, "rail-settings", "mods/workspace-chrome/settings.svg", "设置", () => run("app.settings")))
      .child(button(t, "rail-open", "mods/workspace-chrome/chevron-right.svg", "展开（⌘B）", toggleSidebar));
  }

  const groups = spaces().map((s, i) => v_flex().gap(4).flex_none()
    .child(spaceHeader(t, s, i))
    .children(list.filter((a) => a.space === s.id).map((a) => card(t, a, mids.get(a.address)))));
  return v_flex().size_full().px(10).pb(8)
    .child(h_flex().h(26).flex_none().items_center().justify_between()
      .child(div().text_size(12).text_color(t.dim).child("怪兽名册"))
      .child(h_flex().gap(2)
        .child(button(t, "ros-new", "mods/workspace-chrome/plus.svg", "新建 space", () => run("space.new")))
        .child(button(t, "ros-close", "mods/workspace-chrome/chevron-left.svg", "收起（⌘B）", toggleSidebar))))
    .child(v_flex().id("ros-list").flex_1().min_h(0).gap(10).overflow_y_scrollbar()
      .children(groups)
      .when(list.length === 0, (el) => el.child(div().px(6).py(4).text_size(12).text_color(t.dim).child("还没有运行中的 Agent"))));
}
