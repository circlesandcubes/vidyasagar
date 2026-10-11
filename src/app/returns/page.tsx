import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Returns and refunds" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PolicyPage policy="returns" title="Returns and refunds" />;
}
