import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import LoginForm from "@/components/LoginForm";
import { userId } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  if (await userId()) redirect("/app");
  const { welcome } = await searchParams;
  return (
    <AuthShell
      title="Sign in"
      intro="See your Reels, your menu and what Muse is making next."
      foot={<>Have an invitation code? <Link href="/signup" className="link">Create your account</Link></>}
    >
      <LoginForm welcome={!!welcome} />
    </AuthShell>
  );
}
