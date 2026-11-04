import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import SignupForm from "@/components/SignupForm";
import { userId } from "@/lib/auth";

export const metadata = { title: "Join with an invitation" };

export default async function SignupPage({ searchParams }) {
  if (await userId()) redirect("/app");
  const { code } = await searchParams;
  return (
    <AuthShell
      title="Bring your kitchen to Muse."
      intro="Enter your invitation code and tell us where to send your Reels."
      foot={<>Already have an account? <Link href="/login" className="link">Sign in</Link></>}
    >
      <SignupForm initialCode={typeof code === "string" ? code.toUpperCase().slice(0, 40) : ""} />
    </AuthShell>
  );
}
