import { PolicyPage } from "@/components/policy-page";

export const metadata = { title: "Delivery information" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <PolicyPage policy="shipping" title="Delivery information" />;
}
