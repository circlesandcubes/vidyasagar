import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Terms of sale" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PolicyPage policy="terms" title="Terms of sale" />;
}
