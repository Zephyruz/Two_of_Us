"use client";

import { useEffect, useState } from "react";
import { Heart, LoaderCircle } from "lucide-react";

export default function LoginForm() {
  const [invitation, setInvitation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    function receiveInvitation() {
      if (!window.location.hash) return;
      // Keep invitation secrets out of access logs and Referer headers.
      const params = new URLSearchParams(window.location.hash.slice(1));
      setInvitation(params.get("invite") || "");
      setEmail(params.get("email") || "");
      setPassword(""); setConfirm(""); setError("");
      window.history.replaceState(null, "", "/login");
    }
    window.addEventListener("hashchange", receiveInvitation);
    receiveInvitation();
    return () => window.removeEventListener("hashchange", receiveInvitation);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (invitation && password !== confirm) { setError("两次输入的密码不一致"); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: invitation ? "register" : "login", email, password, invitation }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "登录失败，请重试");
      window.location.replace("/");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "连接失败，请重试"); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center bg-[#f4f2ed] px-5 py-12 text-[#242622]">
    <section className="w-full max-w-md rounded-[28px] border border-black/[.07] bg-[#faf9f6] p-7 sm:p-10">
      <Heart className="mb-8 text-[#c77862]" size={30} aria-hidden="true" />
      <p className="text-sm text-[#858880]">两个人 · 私人空间</p>
      <h1 className="mt-3 text-3xl font-medium">{invitation ? "欢迎来到我们的空间" : "欢迎回来"}</h1>
      <p className="mt-3 text-sm leading-6 text-[#767970]">{invitation ? "为受邀邮箱设置密码，开始记录共同生活。" : "用受邀邮箱和密码登录。新成员需要邀请链接。"}</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block text-sm">邮箱<input className="form-control mt-2" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="block text-sm">密码<input className="form-control mt-2" type="password" autoComplete={invitation ? "new-password" : "current-password"} required minLength={invitation ? 15 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {invitation && <><p className="text-xs text-[#858880]">使用 15 到 128 个字符，可使用容易记住的长句。</p><label className="block text-sm">再次输入密码<input className="form-control mt-2" type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label></>}
        {error && <p role="alert" className="text-sm text-[#a6473b]">{error}</p>}
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#29332b] px-5 py-3.5 font-medium text-white disabled:opacity-50">{busy && <LoaderCircle size={18} className="animate-spin" />}{invitation ? "设置密码并进入" : "登录"}</button>
      </form>
      <p className="mt-6 text-xs leading-5 text-[#858880]">{invitation ? "邀请链接只能使用一次，7 天内有效。" : "忘记密码？请联系空间管理员获取新的邀请链接。"}</p>
      {invitation && <button className="mt-4 text-sm underline" onClick={() => { setInvitation(""); setError(""); setPassword(""); setConfirm(""); }}>已有密码？返回登录</button>}
    </section>
  </main>;
}
