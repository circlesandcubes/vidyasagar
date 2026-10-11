import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Privacy policy" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PolicyPage policy="privacy" title="Privacy policy" />;
}
