"use client";

// A radio group drawn as a row of large cards (text size, speaking speed).
export function SegmentedRadio<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string; content?: React.ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 w-full font-medium">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="tap flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 border-line bg-card font-medium hover:bg-green-tint/50 has-[:checked]:border-green has-[:checked]:bg-green-tint has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-label={option.content ? option.label : undefined}
              className="sr-only"
            />
            {option.content ?? option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
