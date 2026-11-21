// 界面文字 / UI strings. 中文是默认；shared("kaiju.lang") 选语言，
// `herdr-app do kaiju.lang` 或名册右上的按钮切换。
// Chinese is the default; shared("kaiju.lang") picks the language,
// toggled with `herdr-app do kaiju.lang` or the button in the roster header.
import { shared, setShared } from "herdr";

export const LANG_KEY = "kaiju.lang";
export const LANGS = ["zh", "en"];

export const STRINGS = {
  zh: {
    // 怪兽名用 manifest 里的；这里只放覆盖 / monster names come from the manifest
    monsters: {},
    langButton: "EN", langTip: "Switch to English",
    roster: "怪兽名册", noAgents: "还没有运行中的 Agent",
    newSpace: "新建 space", newTab: "新建 tab", settings: "设置", rename: "点击重命名",
    expand: "展开（⌘B）", collapse: "收起（⌘B）", toCards: "展开成档案卡", toMini: "折叠成头像",
    waiting: "等你",
    status: { idle: "睡觉中", working: "拆楼中", done: "拆完了", blocked: "等你" },
    quip: { idle: "呼呼大睡，等你派活", working: "正在啃这栋楼", done: "拆完了！在废墟上咆哮", blocked: "举着牌子等你回话" },
    damage: ["完好", "轻损", "重损", "废墟"],
    fields: { name: "代号", program: "程序", base: "驻地", task: "任务", status: "状况", damage: "损坏", record: "战绩" },
    noTask: "未登记", offMap: "场外",
    offMapTip: (name) => `${name}（不在沙盘上）`,
    record: (razed, today) => `拆 ${razed} 栋 · 今天 ${today}`,
    // 计时 / timers: d 为 null 表示「刚刚」/ d is null for "just now"
    minutes: (m) => `${m} 分钟`, hoursMinutes: (h, m) => `${h} 小时 ${m} 分`,
    smashing: (d) => (d == null ? "刚开拆" : `拆了 ${d}`),
    waitingFor: (d) => (d == null ? "刚开始等" : `等了 ${d}`),
    finished: (d) => (d == null ? "刚拆完" : `${d}前拆完`),
    durShort: { lt1: "<1 分", zero: "0 分", min: (m) => `${m} 分`, hm: (h, m) => `${h} 时 ${m} 分` },
    newsTag: "快讯｜", newsTitle: "怪兽快讯", more: (n) => `还有 ${n} 条`,
    newsBlocked: (name, where) => `${name}在 ${where} 区等你`,
    newsDone: (name, where) => `${name}拆完了 ${where} 区`,
  },
  en: {
    monsters: { lizard: "Lizard", ape: "Ape", crab: "Crab", axolotl: "Axolotl", yeti: "Yeti", moth: "Moth", turtle: "Turtle", bat: "Bat" },
    langButton: "中", langTip: "切换到中文",
    roster: "Monster Roster", noAgents: "No agents running yet",
    newSpace: "New space", newTab: "New tab", settings: "Settings", rename: "Click to rename",
    expand: "Expand (⌘B)", collapse: "Collapse (⌘B)", toCards: "Expand to dossier cards", toMini: "Collapse to avatars",
    waiting: "Waiting",
    status: { idle: "Sleeping", working: "Smashing", done: "Razed", blocked: "Waiting" },
    quip: { idle: "Asleep, no job yet", working: "Smashing the tower", done: "Roaring on ruins", blocked: "Waving, needs you" },
    damage: ["Intact", "Light damage", "Heavy damage", "Ruins"],
    fields: { name: "Name", program: "App", base: "Base", task: "Task", status: "State", damage: "Damage", record: "Record" },
    noTask: "none logged", offMap: "off-map",
    offMapTip: (name) => `${name} (not on the map)`,
    record: (razed, today) => `${razed} razed · ${today}`,
    minutes: (m) => `${m} min`, hoursMinutes: (h, m) => `${h} h ${m} min`,
    smashing: (d) => (d == null ? "Just started smashing" : `Smashing for ${d}`),
    waitingFor: (d) => (d == null ? "Just started waiting" : `Waiting for ${d}`),
    finished: (d) => (d == null ? "Just finished" : `Finished ${d} ago`),
    durShort: { lt1: "<1 min", zero: "0 min", min: (m) => `${m} min`, hm: (h, m) => `${h} h ${m} min` },
    newsTag: "NEWS | ", newsTitle: "Monster News", more: (n) => `${n} more`,
    newsBlocked: (name, where) => `${name} is waiting for you in ${where}`,
    newsDone: (name, where) => `${name} razed ${where}`,
  },
};

export const lang = () => (LANGS.includes(shared(LANG_KEY)) ? shared(LANG_KEY) : "zh");
export const S = () => STRINGS[lang()];
export const toggleLang = () => setShared(LANG_KEY, lang() === "zh" ? "en" : "zh");
export const monsterName = (m) => S().monsters[m.id] ?? m.name;
