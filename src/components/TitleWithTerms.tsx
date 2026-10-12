import type { GlossaryTerm } from "@/server/repos";
import { Term } from "./Term";

// Wraps glossary terms that appear literally in a title. No match, no underline.
export function TitleWithTerms({ title, terms }: { title: string; terms: GlossaryTerm[] }) {
  if (terms.length === 0) return title;
  const pattern = terms
    .map((term) => term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .join("|");
  return title.split(new RegExp(`(${pattern})`, "i")).map((part, index) => {
    const term = index % 2 === 1 && terms.find((item) => item.term.toLowerCase() === part.toLowerCase());
    return term ? (
      <Term key={index} term={term}>
        {part}
      </Term>
    ) : (
      part
    );
  });
}
