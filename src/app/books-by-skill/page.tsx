import { permanentRedirect } from "next/navigation";

// One canonical page for skill discovery.
export default function BooksBySkillPage() {
  permanentRedirect("/skills");
}
