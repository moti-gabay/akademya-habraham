import { notFound } from "next/navigation";

// Any address under a site language that no route matches (for example /he/search)
// lands here, so it gets the localized 404 page instead of the framework's default.
export default function UnknownPage() {
  notFound();
}
