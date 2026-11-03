// 怪兽名册：按 space 分组，每个 Agent 一张像素游戏卡：
//   左侧状态色竖条、48px 头像 + 怪兽名牌；右侧程序名 + 状态徽章、正在做什么、space · tab · 计时、楼的损坏进度条
//   像素硬阴影（右下错位 3px）、切角
// 侧栏收起（< 160px）时改画窄栏：每个 space 一块小楼图标 + 状态灯
import { div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, agents, run, openOverlay, window, layout, shared } from "herdr";
import { asset, assign, monsterOf, slotOf, slotColor, isNight, STATUS_TEXT } from "./state.js";

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
  if (!BADGE[status]) return div().flex_none().px(4).text_size(12).text_color(t.dim).child(`z ${text}`);
  return div().flex_none().px(4).text_size(12).bg(BADGE[status]).text_color(status === "blocked" ? "#2b2620" : "#ffffff").child(text);
}

const DAMAGE = ["完好", "轻损", "重损", "废墟"];

// 「3 分钟」「1 小时 5 分」「刚刚」
function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

// 计时文字：拆楼按开始干活算，等你 / 拆完了按状态变化时间算；睡觉中不显示
function timer(a, tab, now) {
  if (a.status === "working" && tab?.working_since) {
    const d = ago(now - tab.working_since);
    return d === "刚刚" ? "刚开拆" : `拆了 ${d}`;
  }
  if ((a.status === "blocked" || a.status === "done") && tab?.changed_at) {
    const d = ago(now - tab.changed_at);
    if (a.status === "blocked") return d === "刚刚" ? "刚开始等" : `等了 ${d}`;
    return d === "刚刚" ? "刚拆完" : `${d}前拆完`;
  }
  return "";
}

// 正在做什么：终端标题去掉前面的图标符号；和程序名一样或为空时不显示
function task(a) {
  const raw = (a.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, "").trim();
  const prog = a.program?.name ?? a.app ?? "";
  // 标题只是程序名 / space 名 / 目录名时不算任务
  const same = [prog, a.app, a.space_name].filter(Boolean).map((x) => x.toLowerCase());
  if (!raw || same.includes(raw.toLowerCase()) || raw === a.address || /^[~/][^\s]*$/.test(raw)) return "";
  return raw;
}

// 4 格像素损坏条
function damageBar(t, lvl) {
  const fill = ["#5fae6e", "#d8a548", "#e07a3c", "#d9573f"][lvl];
  return h_flex().gap(4).items_center()
    .child(h_flex().gap(1).children([0, 1, 2, 3].map((k) =>
      div().w(9).h(6).bg(k <= lvl ? fill : t.raised).border(1).border_color("#00000040"))))
    .child(div().text_size(12).text_color(t.dim).child(DAMAGE[lvl]));
}

function card(t, a, mid, tab, now, dmg) {
  const m = monsterOf(mid);
  const slot = slotOf(a.space);
  const color = slotColor(slot);
  const face = FACE[a.status] ?? "idle";
  const strip = BADGE[a.status] ?? t.border;
  const where = /^(tb)?\d+$/.test(a.tab_name ?? "") ? a.space_name : `${a.space_name} · ${a.tab_name}`;
  const what = task(a);
  const time = timer(a, tab, now);
  const shadow = isNight(t) ? "#00000099" : "#2b262033";
  const bg = a.focused ? t.selected : t.surface;
  const edge = a.focused ? t.input : isNight(t) ? "#3a4352" : "#cfcac2";

  let avatar = image(asset(t, m.avatars[face])).w(48).h(48);
  // 拆楼中：头像轻轻抖（原生 loop）
  if (a.status === "working") avatar = div().id(`ava-${a.address}`).relative().loop("left", { from: -1, to: 1, period: 220 }).child(avatar);
  const portrait = v_flex().flex_none().w(54)
    .child(div().h(50).flex().items_center().justify_center().bg(`${color}30`).border(2).border_color(color).overflow_hidden().child(avatar))
    .child(div().h(14).flex().items_center().justify_center().bg(color).text_size(12).text_color("#ffffff").child(m.name));

  // 切角：四个角盖一个舞台色小方块
  const corner = (pos) => div().absolute().size(2).bg(t.chrome)[pos[0]](0)[pos[1]](0);

  const body = h_flex().relative().h(84).pl(0).pr(8).gap(8).items_center().bg(bg).border(2).border_color(edge)
    .child(div().w(4).h_full().flex_none().bg(strip))
    .child(portrait)
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(h_flex().items_center().gap(6)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(a.program?.name ?? a.app ?? "Agent"))
        .child(badge(t, a.status)))
      .child(div().truncate().text_size(12).text_color(what ? t.foreground : t.dim).child(what || "（没有任务标题）"))
      .child(div().truncate().text_size(12).text_color(t.dim).child(time ? `${where} · ${time}` : where))
      .when(slot != null, (el) => el.child(damageBar(t, dmg ?? 0))))
    .child(corner(["left", "top"])).child(corner(["right", "top"]))
    .child(corner(["left", "bottom"])).child(corner(["right", "bottom"]));

  return div().id(`card-${a.address}`).relative().flex_none().pr(3).pb(3).cursor_pointer()
    .tooltip(`${m.name} · ${a.program?.name ?? a.app ?? "Agent"}${what ? ` · ${what}` : ""}`)
    .on_mouse_down("left", stop)
    .on_click(() => run("pane.focus", { pane: a.pane }))
    // 像素硬阴影
    .child(div().absolute().left(3).top(3).right(0).bottom(0).bg(shadow))
    .child(body.hover((st) => st.border_color(t.input)));
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

export function roster(view, t, cx) {
  const list = agents();
  const now = Date.now();
  const tabs = new Map(spaces().flatMap((s) => s.tabs.map((tb) => [tb.id, tb])));
  const damage = shared("kaiju.damage") ?? {};
  // 有怪兽在拆楼时，每到整分钟重绘一次刷新计时；没人干活就不预约（不做周期性重绘）
  if (list.some((a) => a.status === "working") && !view.tick) {
    view.tick = true;
    cx.timer.after(60000 - (now % 60000) + 50, (cx) => { view.tick = false; cx.notify(); });
  }
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

  const groups = spaces().map((s, i) => v_flex().gap(6).flex_none()
    .child(spaceHeader(t, s, i))
    .children(list.filter((a) => a.space === s.id).map((a) => card(t, a, mids.get(a.address), tabs.get(a.tab), now, damage[a.space]))));
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
