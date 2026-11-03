"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronRight, Heart, House, ImagePlus, Images, ListChecks, LogOut, LoaderCircle, NotebookPen, Plus, RotateCcw, Settings2, Trash2, X } from "lucide-react";

type Idea = { id: number; title: string; category: string; note: string; status: string; plannedDate: string | null; createdBy: string; createdAt: string };
type Habit = { id: number; title: string; cadence: string; createdBy: string };
type HabitCheck = { id: number; habitId: number; userId: string; day: string };
type Memory = { id: number; title: string; note: string; memoryDate: string; createdBy: string; sourceIdeaId: number | null };
type MemoryPhoto = { id: number; memoryId: number; fileName: string; contentType: string; uploadedBy: string; createdAt: string };
type Person = { userId: string; displayName: string; customName: string | null; email: string };
type Workspace = { currentUserId: string; people: Person[]; ideas: Idea[]; habits: Habit[]; checks: HabitCheck[]; memories: Memory[]; memoryPhotos: MemoryPhoto[]; pendingPartnerName: string };
type Tab = "today" | "ideas" | "habits" | "memories";
type DeleteTarget = { kind: "Idea" | "Habit" | "Memory"; id: number; title: string };
type Modal = null | { type: "idea" } | { type: "habit" } | { type: "memory"; idea?: Idea } | { type: "schedule"; idea: Idea } | { type: "names" } | { type: "gallery"; memory: Memory } | { type: "delete"; target: DeleteTarget };

const categoryMeta: Record<string, { label: string; mark: string }> = {
  eat: { label: "想吃", mark: "餐" }, buy: { label: "想买", mark: "物" }, go: { label: "想去", mark: "行" },
  cook: { label: "想做", mark: "做" }, watch: { label: "想看", mark: "看" }, other: { label: "其他", mark: "想" },
};
const nav = [
  { id: "today" as const, label: "今天", icon: House }, { id: "ideas" as const, label: "清单", icon: ListChecks },
  { id: "habits" as const, label: "习惯", icon: RotateCcw }, { id: "memories" as const, label: "回忆", icon: Heart },
];
const localDay = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const shortDate = (value: string) => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00`));
const personName = (person?: Person, fallback = "TA") => person?.customName || person?.displayName?.split("@")[0] || fallback;
const dailyQuotes = [
  { text: "求知若饥，虚心若愚。", source: "史蒂夫·乔布斯" },
  { text: "愿原力与你同在。", source: "《星球大战》" },
  { text: "把握今天。", source: "《死亡诗社》" },
  { text: "明天又是新的一天。", source: "《乱世佳人》" },
  { text: "一直游下去。", source: "《海底总动员》" },
  { text: "生活总有惊喜。", source: "《阿甘正传》" },
  { text: "你让我完整。", source: "《甜心先生》" },
  { text: "成为更好的人。", source: "《尽善尽美》" },
  { text: "我会回来的。", source: "《终结者》" },
  { text: "没有人是完美的。", source: "《热情似火》" },
  { text: "为什么这么严肃？", source: "《蝙蝠侠：黑暗骑士》" },
  { text: "我看见了死人。", source: "《第六感》" },
  { text: "飞向宇宙，浩瀚无垠！", source: "《玩具总动员》" },
  { text: "家是最好的地方。", source: "《绿野仙踪》" },
  { text: "我们会一直拥有巴黎。", source: "《卡萨布兰卡》" },
  { text: "生活会找到出路。", source: "《侏罗纪公园》" },
  { text: "你不能承受真相！", source: "《好人寥寥》" },
  { text: "我是世界之王！", source: "《泰坦尼克号》" },
  { text: "自由！", source: "《勇敢的心》" },
  { text: "永远不要放弃。", source: "《银河追缉令》" },
];
const dailyQuote = (day: string) => dailyQuotes[Number(day.replaceAll("-", "")) % dailyQuotes.length];

export default function TogetherApp({ displayName }: { displayName: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const mutation = useRef(false);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (response.status === 401) { window.location.replace("/login"); return; }
    const body = await response.json() as Workspace & { error?: string };
    if (!response.ok) throw new Error(body.error || "读取失败");
    if (version === loadVersion.current) setData(body);
  }, []);
  useEffect(() => {
    const refresh = () => { if (!document.hidden && !mutation.current) load().catch((error) => setNotice(error.message)); };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  function beginMutation() {
    if (mutation.current) return false;
    mutation.current = true; ++loadVersion.current; setBusy(true); return true;
  }
  function endMutation() { mutation.current = false; setBusy(false); }
  async function logout() {
    if (!beginMutation()) return;
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error("退出失败，请重试");
      window.location.replace("/login");
    } catch (error) { setNotice(error instanceof Error ? error.message : "退出失败"); }
    finally { endMutation(); }
  }
  async function act(payload: Record<string, unknown>, success?: string) {
    if (!beginMutation()) return;
    try { const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "保存失败"); await load(); setModal(null); if (success) { setNotice(success); window.setTimeout(() => setNotice(""), 2400); } }
    catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { endMutation(); }
  }
  async function uploadPhotoFiles(memoryId: number, files: File[]) {
    if (!files.length) return;
    const form = new FormData();
    form.set("memoryId", String(memoryId));
    files.forEach((file) => form.append("photos", file));
    const response = await fetch("/api/memory-photos", { method: "POST", body: form });
    const body = await response.json() as { error?: string };
    if (!response.ok) throw new Error(body.error || "照片上传失败");
  }
  async function saveMemory(payload: Record<string, unknown>, files: File[]) {
    if (!beginMutation()) return;
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string; memory: { id: number } };
      if (!response.ok) throw new Error(body.error || "保存失败");
      let uploadError = "";
      if (files.length) { try { await uploadPhotoFiles(body.memory.id, files); } catch (error) { uploadError = error instanceof Error ? error.message : "照片上传失败"; } }
      await load(); setModal(null); setNotice(uploadError ? `记录已保存，但${uploadError}` : files.length ? "记录和照片已保存" : "记录已保存"); window.setTimeout(() => setNotice(""), 3200);
    } catch (error) { setNotice(error instanceof Error ? error.message : "保存失败"); } finally { endMutation(); }
  }
  async function addPhotos(memoryId: number, files: File[]) {
    if (!files.length) return;
    if (!beginMutation()) return;
    try { await uploadPhotoFiles(memoryId, files); await load(); setNotice("照片已添加"); window.setTimeout(() => setNotice(""), 2400); }
    catch (error) { setNotice(error instanceof Error ? error.message : "照片上传失败"); } finally { endMutation(); }
  }
  async function deletePhoto(photoId: number) {
    if (!window.confirm("删除这张照片？删除后无法恢复。")) return;
    if (!beginMutation()) return;
    try { const response = await fetch(`/api/memory-photos?id=${photoId}`, { method: "DELETE" }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error || "删除失败"); await load(); setNotice("照片已删除"); window.setTimeout(() => setNotice(""), 2400); }
    catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); } finally { endMutation(); }
  }
  const today = localDay();
  const me = data?.people.find((person) => person.userId === data.currentUserId);
  const partner = data?.people.find((person) => person.userId !== data.currentUserId);
  const myDisplayName = personName(me, "我");
  const partnerDisplayName = personName(partner, data?.pendingPartnerName || "TA");
  const planned = useMemo(() => (data?.ideas || []).filter((item) => item.status === "planned").sort((a, b) => (a.plannedDate || "").localeCompare(b.plannedDate || "")), [data]);
  const openIdeas = useMemo(() => (data?.ideas || []).filter((item) => item.status !== "done" && (filter === "all" || item.category === filter)), [data, filter]);
  const doneToday = (habitId: number, userId?: string) => Boolean(userId && data?.checks.some((check) => check.habitId === habitId && check.userId === userId && check.day === today));
  const addForTab = () => { if (tab === "habits") setModal({ type: "habit" }); else if (tab === "memories") setModal({ type: "memory" }); else setModal({ type: "idea" }); };
  if (!data) return <Loading notice={notice} />;
  return <main className="min-h-dvh bg-[#f4f2ed] text-[#242622]">
    <header className="sticky top-0 z-20 border-b border-black/[.06] bg-[#f4f2ed]/90 backdrop-blur-xl"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:h-20 md:px-8">
      <button onClick={() => setTab("today")} className="flex items-center gap-3" aria-label="返回今天"><span className="relative flex h-8 w-11 items-center"><span className="absolute left-0 h-8 w-8 rounded-full bg-[#29332b]" /><span className="absolute right-0 h-8 w-8 rounded-full border-2 border-[#f4f2ed] bg-[#c77862]" /></span><span className="text-[17px] font-semibold tracking-[-0.03em]">两个人</span></button>
      <nav className="hidden items-center gap-1 rounded-full bg-white/60 p-1 md:flex">{nav.map(({ id, label }) => <button key={id} onClick={() => setTab(id)} className={`rounded-full px-5 py-2 text-sm transition ${tab === id ? "bg-white text-[#242622] shadow-sm" : "text-[#777a73] hover:text-[#242622]"}`}>{label}</button>)}</nav>
      <div className="flex items-center gap-2"><button disabled={busy} onClick={() => setModal({ type: "names" })} className="flex items-center gap-2 rounded-full p-1" aria-label="设置双方名字"><span className="flex items-center -space-x-2"><Avatar name={myDisplayName || displayName} dark /><Avatar name={partnerDisplayName} /></span><Settings2 size={17} className="text-[#858880]" /></button><button disabled={busy} onClick={logout} aria-label="退出登录" title="退出登录" className="rounded-full p-2 text-[#858880] hover:bg-black/5"><LogOut size={18} /></button></div>
    </div></header>
    <fieldset disabled={busy} className="contents"><div className="mx-auto max-w-6xl px-5 pb-28 pt-7 md:px-8 md:pb-14 md:pt-11">
      {tab === "today" && <Today data={data} planned={planned} today={today} me={me} partner={partner} myName={myDisplayName} partnerName={partnerDisplayName} doneToday={doneToday} onToggle={(habitId) => act({ action: "setHabitCheck", habitId, day: today, checked: !doneToday(habitId, data.currentUserId) })} onOpenIdea={() => setModal({ type: "idea" })} onOpenHabit={() => setModal({ type: "habit" })} onComplete={(idea) => setModal({ type: "memory", idea })} />}
      {tab === "ideas" && <Ideas items={openIdeas} people={data.people} filter={filter} setFilter={setFilter} onAdd={() => setModal({ type: "idea" })} onPlan={(idea) => setModal({ type: "schedule", idea })} onComplete={(idea) => setModal({ type: "memory", idea })} onDelete={(idea) => setModal({ type: "delete", target: { kind: "Idea", id: idea.id, title: idea.title } })} />}
      {tab === "habits" && <Habits habits={data.habits} checks={data.checks} people={data.people} today={today} me={me} partner={partner} myName={myDisplayName} partnerName={partnerDisplayName} currentUserId={data.currentUserId} onAdd={() => setModal({ type: "habit" })} onToggle={(habitId) => act({ action: "setHabitCheck", habitId, day: today, checked: !doneToday(habitId, data.currentUserId) })} onDelete={(habit) => setModal({ type: "delete", target: { kind: "Habit", id: habit.id, title: habit.title } })} />}
      {tab === "memories" && <Memories memories={data.memories} photos={data.memoryPhotos} people={data.people} onAdd={() => setModal({ type: "memory" })} onOpenPhotos={(memory) => setModal({ type: "gallery", memory })} onDelete={(memory) => setModal({ type: "delete", target: { kind: "Memory", id: memory.id, title: memory.title } })} />}
    </div>
    <button onClick={addForTab} className="fixed bottom-[88px] right-5 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[#29332b] text-white shadow-[0_10px_30px_rgba(41,51,43,.24)] md:bottom-8 md:right-8" aria-label="新增"><Plus size={21} /></button>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-black/[.07] bg-[#faf9f6]/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl md:hidden">{nav.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${tab === id ? "text-[#29332b]" : "text-[#979990]"}`}><Icon size={20} strokeWidth={tab === id ? 2.2 : 1.7} /><span>{label}</span></button>)}</nav>
    {modal && <ModalSheet modal={modal} busy={busy} close={() => setModal(null)} submit={act} submitMemory={saveMemory} uploadPhotos={addPhotos} deletePhoto={deletePhoto} memoryPhotos={data.memoryPhotos} me={me} partner={partner} pendingPartnerName={data.pendingPartnerName} />}
    </fieldset>{notice && <div role="status" className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-[#242622] px-4 py-2 text-sm text-white shadow-xl">{notice}</div>}
  </main>;
}

function Today({ data, planned, today, me, partner, myName, partnerName, doneToday, onToggle, onOpenIdea, onOpenHabit, onComplete }: { data: Workspace; planned: Idea[]; today: string; me?: Person; partner?: Person; myName: string; partnerName: string; doneToday: (id: number, userId?: string) => boolean; onToggle: (id: number) => void; onOpenIdea: () => void; onOpenHabit: () => void; onComplete: (idea: Idea) => void }) {
  const habitsDone = data.habits.filter((habit) => doneToday(habit.id, data.currentUserId)).length;
  const quote = dailyQuote(today);
  return <><section className="mb-10 grid gap-6 md:grid-cols-[1.35fr_.65fr] md:gap-8"><div className="flex min-h-[310px] flex-col justify-between rounded-[30px] bg-[#29332b] p-7 text-[#f8f5ef] md:min-h-[370px] md:p-10">
    <div className="flex items-center justify-between text-white/60"><span className="text-base font-medium md:text-lg">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><span className="text-sm">{myName}</span></div>
    <div><h1 className="max-w-xl text-[29px] font-medium leading-[1.45] tracking-normal md:text-[42px] md:leading-[1.35]">{quote.text}</h1><p className="mt-4 text-sm text-white/55">— {quote.source}</p></div>
    <div className="flex gap-6 text-sm"><span><b className="mr-2 text-xl font-medium text-white">{data.ideas.filter((item) => item.status !== "done").length}</b>项清单</span><span><b className="mr-2 text-xl font-medium text-white">{data.memories.length}</b>条记录</span></div>
  </div><div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1"><div className="rounded-[26px] bg-[#d9cab7] p-6"><p className="text-sm text-black/50">下一个计划</p>{planned[0] ? <><p className="mt-8 text-2xl font-medium tracking-tight">{planned[0].title}</p><p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-black/55"><CalendarDays size={15} />{planned[0].plannedDate ? shortDate(planned[0].plannedDate) : "待定"}<span>· {personName(data.people.find((person) => person.userId === planned[0].createdBy))} 提出</span></p></> : <button onClick={onOpenIdea} className="mt-8 flex items-center gap-2 text-left text-xl font-medium">添加计划 <ArrowRight size={19} /></button>}</div>
    <div className="rounded-[26px] border border-black/[.07] bg-[#faf9f6] p-6"><div className="flex items-start justify-between"><div><p className="text-sm text-black/45">今日习惯</p><p className="mt-2 text-3xl font-medium tracking-tight">{habitsDone}/{data.habits.length}</p></div><span className="rounded-full bg-[#e7ebe4] px-3 py-1 text-xs text-[#586557]">已完成</span></div><div className="mt-7 flex -space-x-2"><Avatar name={myName} dark /><Avatar name={partnerName} /></div></div></div></section>
  <section className="grid gap-9 lg:grid-cols-2"><div><SectionTitle eyebrow="习惯" title="今日打卡" />{data.habits.length ? <div className="space-y-3">{data.habits.slice(0, 4).map((habit) => { const checked = doneToday(habit.id, data.currentUserId); const creator = data.people.find((person) => person.userId === habit.createdBy); return <button key={habit.id} onClick={() => onToggle(habit.id)} className="group flex w-full items-center gap-4 rounded-2xl border border-black/[.07] bg-[#faf9f6] p-4 text-left transition hover:border-black/15"><span className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${checked ? "border-[#29332b] bg-[#29332b] text-white" : "border-black/10 bg-black/[.025] text-black/20 group-hover:border-black/20"}`}><Check size={17} /></span><span className="flex-1"><b className="block font-medium">{habit.title}</b><small className="text-[#8b8e86]">{habit.cadence} · {personName(creator)} 添加</small></span><div className="flex -space-x-1"><TinyDot active={doneToday(habit.id, me?.userId)} /><TinyDot active={doneToday(habit.id, partner?.userId)} /></div></button>; })}</div> : <Empty text="还没有习惯。" action="添加习惯" onClick={onOpenHabit} />}</div>
  <div><SectionTitle eyebrow="计划" title="近期安排" />{planned.length ? <div className="space-y-3">{planned.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-white/55 p-4"><CategoryBadge category={item.category} /><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.title}</p><p className="text-sm text-[#8b8e86]">{item.plannedDate ? shortDate(item.plannedDate) : "未设置日期"} · {personName(data.people.find((person) => person.userId === item.createdBy))} 提出</p></div><button onClick={() => onComplete(item)} className="rounded-full border border-black/10 px-3 py-1.5 text-xs hover:bg-white">完成</button></div>)}</div> : <Empty text="还没有已安排的项目。" action="添加清单" onClick={onOpenIdea} />}</div></section></>;
}

function Ideas({ items, people, filter, setFilter, onAdd, onPlan, onComplete, onDelete }: { items: Idea[]; people: Person[]; filter: string; setFilter: (v: string) => void; onAdd: () => void; onPlan: (idea: Idea) => void; onComplete: (idea: Idea) => void; onDelete: (idea: Idea) => void }) {
  const filters = [["all", "全部"], ["go", "想去"], ["eat", "想吃"], ["buy", "想买"], ["cook", "想做"], ["watch", "想看"]];
  return <section><PageHeading eyebrow="清单" title="清单" description="记录想吃、想买、想去、想做和想看的内容。" /><div className="mb-7 flex gap-2 overflow-x-auto pb-1 scrollbar-none">{filters.map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`shrink-0 rounded-full px-4 py-2 text-sm ${filter === id ? "bg-[#29332b] text-white" : "bg-white/65 text-[#6f726b]"}`}>{label}</button>)}</div>
  {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.id} className="flex min-h-[210px] flex-col rounded-[24px] border border-black/[.07] bg-[#faf9f6] p-5"><div className="flex items-center justify-between"><CategoryBadge category={item.category} /><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] ${item.status === "planned" ? "bg-[#e8ded0] text-[#745d48]" : "bg-[#efeee9] text-[#777a73]"}`}>{item.status === "planned" ? "已安排" : "未安排"}</span><DeleteButton label={`删除清单：${item.title}`} onClick={() => onDelete(item)} /></div></div><h3 className="mt-6 text-xl font-medium tracking-[-.025em]">{item.title}</h3><p className="mt-1 text-xs text-[#9b9d96]">{personName(people.find((person) => person.userId === item.createdBy))} 提出</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#858880]">{item.note || (item.plannedDate ? shortDate(item.plannedDate) : "没有备注")}</p><div className="mt-auto flex gap-2 pt-6"><button onClick={() => onPlan(item)} className="flex-1 rounded-full border border-black/10 px-3 py-2 text-sm hover:bg-white">{item.status === "planned" ? "改日期" : "安排"}</button><button onClick={() => onComplete(item)} className="flex-1 rounded-full bg-[#29332b] px-3 py-2 text-sm text-white">完成</button></div></article>)}</div> : <Empty text="清单为空。" action="添加第一条" onClick={onAdd} large />}</section>;
}

function Habits({ habits, checks, people, today, me, partner, myName, partnerName, currentUserId, onAdd, onToggle, onDelete }: { habits: Habit[]; checks: HabitCheck[]; people: Person[]; today: string; me?: Person; partner?: Person; myName: string; partnerName: string; currentUserId: string; onAdd: () => void; onToggle: (id: number) => void; onDelete: (habit: Habit) => void }) {
  const isDone = (habitId: number, userId?: string) => Boolean(userId && checks.some((c) => c.habitId === habitId && c.userId === userId && c.day === today));
  return <section><PageHeading eyebrow="习惯" title="习惯打卡" description="分别记录双方的完成情况。" />{habits.length ? <div className="grid gap-4 md:grid-cols-2">{habits.map((habit) => { const checked = isDone(habit.id, currentUserId); const creator = people.find((person) => person.userId === habit.createdBy); return <article key={habit.id} className="rounded-[26px] border border-black/[.07] bg-[#faf9f6] p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[#8a8d85]">{habit.cadence} · {personName(creator)} 添加</p><h3 className="mt-2 text-2xl font-medium tracking-tight">{habit.title}</h3></div><div className="flex items-center gap-2"><DeleteButton label={`删除习惯：${habit.title}`} onClick={() => onDelete(habit)} /><button onClick={() => onToggle(habit.id)} className={`flex h-12 w-12 items-center justify-center rounded-full border transition ${checked ? "border-[#29332b] bg-[#29332b] text-white" : "border-black/10 bg-black/[.025] text-black/20 hover:border-black/20"}`} aria-label={checked ? "取消今日打卡" : "完成今日打卡"}><Check /></button></div></div><div className="mt-8 grid grid-cols-2 gap-3"><PersonStatus person={me} name={myName} done={isDone(habit.id, me?.userId)} /><PersonStatus person={partner} name={partnerName} done={isDone(habit.id, partner?.userId)} /></div></article>; })}</div> : <Empty text="还没有习惯。" action="添加习惯" onClick={onAdd} large />}</section>;
}

function Memories({ memories, photos, people, onAdd, onOpenPhotos, onDelete }: { memories: Memory[]; photos: MemoryPhoto[]; people: Person[]; onAdd: () => void; onOpenPhotos: (memory: Memory) => void; onDelete: (memory: Memory) => void }) {
  return <section><PageHeading eyebrow="记录" title="记录" description="按日期查看已经完成的项目和手动添加的记录。" />{memories.length ? <div className="relative mx-auto max-w-3xl before:absolute before:bottom-0 before:left-[17px] before:top-1 before:w-px before:bg-black/10 md:before:left-[23px]">{memories.map((memory) => { const author = people.find((p) => p.userId === memory.createdBy); const memoryPhotos = photos.filter((photo) => photo.memoryId === memory.id); const visiblePhotos = memoryPhotos.slice(0, 4); return <article key={memory.id} className="relative mb-5 pl-12 md:pl-16"><span className="absolute left-[10px] top-7 h-[15px] w-[15px] rounded-full border-4 border-[#f4f2ed] bg-[#c77862] md:left-4" /><div className="rounded-[24px] bg-[#faf9f6] p-5 md:p-7"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><time className="text-sm text-[#888b83]">{shortDate(memory.memoryDate)}</time><span className="text-xs text-[#9b9d96]">{personName(author)} 记录</span></div><div className="flex items-center gap-1"><button type="button" onClick={() => onOpenPhotos(memory)} aria-label={memoryPhotos.length ? `查看和添加照片，现有 ${memoryPhotos.length} 张` : "添加照片"} className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-[#858880] transition hover:bg-black/5"><Images size={16} />{memoryPhotos.length || "添加"}</button><DeleteButton label={`删除记录：${memory.title}`} onClick={() => onDelete(memory)} /></div></div><h3 className="mt-4 text-xl font-medium tracking-tight md:text-2xl">{memory.title}</h3>{memory.note && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-[#676a63]">{memory.note}</p>}{memoryPhotos.length > 0 && <button type="button" onClick={() => onOpenPhotos(memory)} className={`mt-5 grid w-full overflow-hidden rounded-2xl bg-black/5 text-left ${visiblePhotos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`} aria-label={`查看 ${memoryPhotos.length} 张照片`}>{visiblePhotos.map((photo, index) => <span key={photo.id} className={`relative block overflow-hidden ${visiblePhotos.length === 1 ? "aspect-[4/3]" : "aspect-square"}`}><img src={`/api/memory-photos?id=${photo.id}`} alt={`${memory.title}的照片 ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />{index === 3 && memoryPhotos.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-medium text-white">+{memoryPhotos.length - 4}</span>}</span>)}</button>}</div></article>; })}</div> : <Empty text="还没有记录。" action="添加记录" onClick={onAdd} large />}</section>;
}

function ModalSheet({ modal, busy, close, submit, submitMemory, uploadPhotos, deletePhoto, memoryPhotos, me, partner, pendingPartnerName }: { modal: Exclude<Modal, null>; busy: boolean; close: () => void; submit: (payload: Record<string, unknown>, success?: string) => void; submitMemory: (payload: Record<string, unknown>, files: File[]) => void; uploadPhotos: (memoryId: number, files: File[]) => void; deletePhoto: (photoId: number) => void; memoryPhotos: MemoryPhoto[]; me?: Person; partner?: Person; pendingPartnerName: string }) {
  const [title, setTitle] = useState(modal.type === "memory" && modal.idea ? modal.idea.title : ""); const [category, setCategory] = useState("go"); const [note, setNote] = useState(""); const [date, setDate] = useState(modal.type === "schedule" ? modal.idea.plannedDate || localDay() : localDay()); const [cadence, setCadence] = useState("每天");
  const [myName, setMyName] = useState(personName(me, "我")); const [partnerName, setPartnerName] = useState(personName(partner, pendingPartnerName || "TA"));
  const [photos, setPhotos] = useState<File[]>([]); const [photoError, setPhotoError] = useState("");


  function selectedPhotos(list: FileList | null) {
    const files = Array.from(list || []);
    if (files.length > 9) { setPhotoError("每次最多选择 9 张照片"); return []; }
    const invalid = files.find((file) => !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type) || file.size > 8 * 1024 * 1024);
    if (invalid) { setPhotoError("请选择 JPG、PNG、WebP 或 HEIC，单张不超过 8 MB"); return []; }
    setPhotoError(""); return files;
  }

  if (modal.type === "delete") {
    const action = `delete${modal.target.kind}`;
    return <DialogFrame close={close} eyebrow="确认删除" title={`删除“${modal.target.title}”？`} description="删除后无法恢复。"><div className="mt-7 flex gap-3"><button type="button" onClick={close} className="flex-1 rounded-full border border-black/10 px-5 py-3.5 font-medium">取消</button><button type="button" disabled={busy} onClick={() => submit({ action, id: modal.target.id }, "已删除")} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#a6473b] px-5 py-3.5 font-medium text-white disabled:opacity-50">{busy && <LoaderCircle size={18} className="animate-spin" />}确认删除</button></div></DialogFrame>;
  }

  if (modal.type === "names") {
    return <DialogFrame close={close} eyebrow="设置" title="双方名字" description="名字只用于这个网站内显示。"><form onSubmit={(event) => { event.preventDefault(); submit({ action: "updateNames", myName, partnerName }, "名字已保存"); }} className="mt-7 space-y-5"><Field label="我的名字"><input autoFocus value={myName} onChange={(event) => setMyName(event.target.value)} required maxLength={30} className="form-control" /></Field><Field label="对方名字"><input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} required maxLength={30} className="form-control" /></Field><button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#29332b] px-5 py-3.5 font-medium text-white disabled:opacity-50">{busy && <LoaderCircle size={18} className="animate-spin" />}保存</button></form></DialogFrame>;
  }

  if (modal.type === "gallery") {
    const galleryPhotos = memoryPhotos.filter((photo) => photo.memoryId === modal.memory.id);
    return <DialogFrame close={close} eyebrow="照片" title={modal.memory.title} description={`${galleryPhotos.length} 张照片，可继续分批添加。`}><label className="mt-6 flex cursor-pointer items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium"><ImagePlus size={18} />{busy ? "正在上传…" : "添加照片"}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple disabled={busy} className="hidden" onChange={(event) => { const files = selectedPhotos(event.target.files); if (files.length) uploadPhotos(modal.memory.id, files); event.currentTarget.value = ""; }} /></label>{photoError && <p className="mt-3 text-sm text-[#a6473b]">{photoError}</p>}{galleryPhotos.length ? <div className="mt-5 grid grid-cols-2 gap-2">{galleryPhotos.map((photo, index) => <figure key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-black/5"><img src={`/api/memory-photos?id=${photo.id}`} alt={`${modal.memory.title}的照片 ${index + 1}`} className="h-full w-full object-cover" /><button type="button" disabled={busy} onClick={() => deletePhoto(photo.id)} aria-label={`删除照片 ${index + 1}`} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur disabled:opacity-50"><Trash2 size={16} /></button></figure>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-[#858880]">还没有照片。</div>}</DialogFrame>;
  }

  const config = modal.type === "idea" ? ["添加清单", "填写分类和备注。"] : modal.type === "habit" ? ["添加习惯", "设置名称和频率。"] : modal.type === "schedule" ? ["设置日期", modal.idea.title] : ["添加记录", modal.idea ? `完成：${modal.idea.title}` : "填写日期和内容。"];
  function send(event: React.FormEvent) { event.preventDefault(); if (modal.type === "idea") submit({ action: "createIdea", title, category, note }, "已添加到清单"); if (modal.type === "habit") submit({ action: "createHabit", title, cadence }, "习惯已添加"); if (modal.type === "schedule") submit({ action: "updateIdea", id: modal.idea.id, status: "planned", plannedDate: date }, "日期已保存"); if (modal.type === "memory") submitMemory({ action: "createMemory", title, note, memoryDate: date, sourceIdeaId: modal.idea?.id }, photos); }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><section role="dialog" aria-modal="true" className="flex max-h-[calc(100dvh-12px)] w-full flex-col overflow-hidden rounded-t-[28px] bg-[#faf9f6] p-5 shadow-2xl sm:max-h-[92dvh] sm:max-w-lg sm:rounded-[28px] sm:p-8"><div className="flex shrink-0 items-start justify-between"><div>{modal.type !== "idea" && <p className="text-xs font-medium uppercase tracking-[.18em] text-[#9a796b]">新增</p>}<h2 className={`${modal.type === "idea" ? "" : "mt-2"} text-2xl font-medium tracking-tight`}>{config[0]}</h2>{modal.type !== "idea" && <p className="mt-2 text-sm leading-6 text-[#81847c]">{config[1]}</p>}</div><button onClick={close} className="rounded-full bg-black/5 p-2" aria-label="关闭"><X size={18} /></button></div><form onSubmit={send} className={`${modal.type === "idea" ? "mt-5 space-y-4" : "mt-7 space-y-5"} min-h-0 overflow-y-auto overscroll-contain pb-[max(0px,env(safe-area-inset-bottom))]`}>
  {modal.type !== "schedule" && <Field label={modal.type === "habit" ? "想一起坚持什么" : "标题"}><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder={modal.type === "habit" ? "例如：晚饭后散步十分钟" : "例如：去海边看一次日落"} className="form-control" /></Field>}
  {modal.type === "idea" && <><Field label="分类"><div className="grid grid-cols-3 gap-1.5">{Object.entries(categoryMeta).map(([id, item]) => <button type="button" key={id} onClick={() => setCategory(id)} className={`rounded-xl border px-2 py-2 text-sm ${category === id ? "border-[#29332b] bg-[#29332b] text-white" : "border-black/10 bg-white"}`}>{item.label}</button>)}</div></Field><Field label="备注（可不填）"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="地址、链接或预算" className="form-control min-h-16 resize-none" /></Field></>}
  {modal.type === "habit" && <Field label="频率"><select value={cadence} onChange={(e) => setCadence(e.target.value)} className="form-control"><option>每天</option><option>工作日</option><option>每周三次</option><option>每周一次</option></select></Field>}
  {(modal.type === "schedule" || modal.type === "memory") && <Field label={modal.type === "schedule" ? "计划日期" : "发生日期"}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="form-control" /></Field>}
  {modal.type === "memory" && <Field label="想留下的话（可不填）"><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="那天发生了什么？有什么想一起记住？" className="form-control min-h-28 resize-none" /></Field>}
  {modal.type === "memory" && <Field label="照片（可不填）"><label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-black/15 bg-white/55 px-4 py-4 text-sm font-medium"><ImagePlus size={19} />选择照片<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple className="hidden" onChange={(event) => { const files = selectedPhotos(event.target.files); if (files.length) setPhotos(files); event.currentTarget.value = ""; }} /></label><p className="mt-2 text-xs leading-5 text-[#92958d]">每次最多选择 9 张，单张不超过 8 MB；保存后仍可继续添加。</p>{photoError && <p className="mt-2 text-sm text-[#a6473b]">{photoError}</p>}{photos.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">{photos.map((file, index) => <span key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded-xl bg-black/5"><PhotoPreview file={file} index={index} /><button type="button" onClick={() => setPhotos((items) => items.filter((_, photoIndex) => photoIndex !== index))} aria-label={`移除照片 ${index + 1}`} className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"><X size={14} /></button></span>)}</div>}</Field>}
  <button disabled={busy} className={`flex w-full items-center justify-center gap-2 rounded-full bg-[#29332b] px-5 py-3.5 font-medium text-white disabled:opacity-50 ${modal.type === "idea" ? "sticky bottom-0 shadow-[0_-12px_20px_#faf9f6]" : ""}`}>{busy && <LoaderCircle size={18} className="animate-spin" />}{modal.type === "idea" ? "添加" : modal.type === "habit" ? "添加" : modal.type === "schedule" ? "保存日期" : "保存记录"}</button>
  </form></section></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="mb-9 max-w-2xl md:mb-12"><p className="text-xs font-medium uppercase tracking-[.18em] text-[#a16f60]">{eyebrow}</p><h1 className="mt-3 text-[36px] font-medium leading-[1.1] tracking-[-.05em] md:text-[54px]">{title}</h1><p className="mt-4 max-w-xl text-[15px] leading-7 text-[#767970] md:text-base">{description}</p></div>; }
function DialogFrame({ close, eyebrow, title, description, children }: { close: () => void; eyebrow: string; title: string; description: string; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section role="dialog" aria-modal="true" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-[#faf9f6] p-6 shadow-2xl sm:max-w-lg sm:rounded-[28px] sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[.18em] text-[#9a796b]">{eyebrow}</p><h2 className="mt-2 text-2xl font-medium tracking-tight">{title}</h2><p className="mt-2 text-sm leading-6 text-[#81847c]">{description}</p></div><button onClick={close} className="rounded-full bg-black/5 p-2" aria-label="关闭"><X size={18} /></button></div>{children}</section></div>; }
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <div className="mb-5"><p className="text-xs uppercase tracking-[.16em] text-[#9c7568]">{eyebrow}</p><h2 className="mt-2 text-2xl font-medium tracking-tight">{title}</h2></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-[#5f625b]">{label}</span>{children}</label>; }
function CategoryBadge({ category }: { category: string }) { const meta = categoryMeta[category] || categoryMeta.other; return <span className="flex items-center gap-2 text-sm text-[#777a73]"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8e4dc] text-xs font-medium text-[#5f625b]">{meta.mark}</span>{meta.label}</span>; }
function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) { return <button type="button" onClick={onClick} aria-label={label} title="删除" className="flex h-8 w-8 items-center justify-center rounded-full text-[#9b9d96] transition hover:bg-[#f2e6e2] hover:text-[#a6473b]"><Trash2 size={15} /></button>; }
function Avatar({ name, dark = false }: { name: string; dark?: boolean }) { return <span title={name} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#f4f2ed] text-xs font-medium ${dark ? "bg-[#29332b] text-white" : "bg-[#d7c5b7] text-[#4f453e]"}`}>{name.slice(0, 1).toUpperCase()}</span>; }
function TinyDot({ active }: { active: boolean }) { return <span className={`h-5 w-5 rounded-full border-2 border-[#faf9f6] ${active ? "bg-[#c77862]" : "bg-[#deded8]"}`} />; }
function PersonStatus({ person, name, done }: { person?: Person; name: string; done: boolean }) { return <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${done ? "bg-[#e4ebe2] text-[#445344]" : "bg-[#efeee9] text-[#8a8d85]"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${done ? "bg-[#647462] text-white" : "bg-[#d9dad4]"}`}>{done ? <Check size={13} /> : name.slice(0, 1).toUpperCase()}</span><span className="truncate text-xs">{name} · {done ? "已完成" : person ? "还未打卡" : "等待加入"}</span></div>; }
function Empty({ text, action, onClick, large = false }: { text: string; action: string; onClick: () => void; large?: boolean }) { return <div className={`flex flex-col items-start justify-center rounded-[24px] border border-dashed border-black/15 bg-white/30 ${large ? "min-h-[300px] p-8 md:p-12" : "min-h-44 p-6"}`}><NotebookPen className="mb-5 text-[#a3a59e]" strokeWidth={1.4} /><p className="max-w-sm text-[15px] leading-7 text-[#777a72]">{text}</p><button onClick={onClick} className="mt-5 flex items-center gap-1 text-sm font-medium">{action}<ChevronRight size={16} /></button></div>; }
function Loading({ notice }: { notice: string }) { return <main className="flex min-h-dvh items-center justify-center bg-[#f4f2ed]"><div className="text-center"><span className="mx-auto mb-5 flex h-12 w-16 items-center justify-center"><span className="h-10 w-10 rounded-full bg-[#29332b]" /><span className="-ml-3 h-10 w-10 rounded-full border-2 border-[#f4f2ed] bg-[#c77862]" /></span><p className="text-sm text-[#777a73]">{notice || "正在打开两个人的空间…"}</p></div></main>; }

function PhotoPreview({ file, index }: { file: File; index: number }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <img ref={image} alt={`待上传照片 ${index + 1}`} className="h-full w-full object-cover" />;
}
