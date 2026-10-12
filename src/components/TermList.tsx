import type { GlossaryTerm } from "@/server/repos";

export function TermList({ terms }: { terms: GlossaryTerm[] }) {
  return (
    <dl className="divide-y divide-line">
      {terms.map((term) => (
        <div key={term.id} className="py-3">
          <dt className="font-medium">{term.term}</dt>
          <dd className="mt-0.5 text-sm text-muted">{term.definition}</dd>
        </div>
      ))}
    </dl>
  );
}
