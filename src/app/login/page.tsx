import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, sessionToken, timingSafeEqual } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const password = process.env.ADMIN_PASSWORD;
  const given = String(formData.get("password") ?? "");
  if (!password || !timingSafeEqual(given, password)) redirect("/login?error=1");
  (await cookies()).set(ADMIN_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-32 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-900">Funding Outreach Engine</h1>
      <p className="mt-1 text-sm text-slate-500">Operator sign-in</p>
      <form action={login} className="mt-6 space-y-4">
        <input
          name="password"
          type="password"
          required
          autoFocus
          placeholder="Admin password"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        {error && <p className="text-sm text-rose-600">Incorrect password.</p>}
        <button className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">Sign in</button>
      </form>
    </main>
  );
}
