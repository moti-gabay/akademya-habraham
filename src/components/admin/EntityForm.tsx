"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { dirOf, localeNames, type Locale } from "@/i18n/routing";
import { CATEGORY_KINDS, inputSchemas, LESSON_ACCESS, type Entity } from "@/server/catalog/schemas";
import { LOCALES } from "@/server/i18n/locales";
import { card, outlineBtn, primaryBtn } from "../ui";
import { callCatalog } from "./api";
import { control, Field } from "./Field";

// One form for every catalog entity: the fields that are the same in every language,
// then a tab per language. Hebrew is required; the others are optional.

type Option = { id: string; label: string };
type Spec = {
  name: string;
  // minutes: shown in minutes, saved in seconds. lines: one item per line.
  kind: "text" | "textarea" | "lines" | "number" | "minutes" | "select" | "ref";
  nullable?: boolean;
  options?: readonly string[];
  optionLabels?: "kinds" | "access";
  ref?: "categories" | "teachers";
  hint?: "slug" | "keyPoints" | "hebcalCode" | "code";
};

const slug: Spec = { name: "slug", kind: "text", hint: "slug" };
const name: Spec = { name: "name", kind: "text" };
const order: Spec = { name: "sortOrder", kind: "number" };
const code: Spec = { name: "code", kind: "text", hint: "code" };

const BASE: Record<Entity, Spec[]> = {
  categories: [
    { name: "kind", kind: "select", options: CATEGORY_KINDS, optionLabels: "kinds" },
    { name: "parentId", kind: "ref", ref: "categories", nullable: true },
    order,
    { name: "hebcalCode", kind: "text", nullable: true, hint: "hebcalCode" },
  ],
  teachers: [],
  lessons: [
    { name: "categoryId", kind: "ref", ref: "categories", nullable: true },
    { name: "teacherId", kind: "ref", ref: "teachers", nullable: true },
    { name: "durationSec", kind: "minutes", nullable: true },
    { name: "access", kind: "select", options: LESSON_ACCESS, optionLabels: "access" },
  ],
  terms: [code, order],
  tracks: [code, order],
  steps: [],
};

const TRANSLATED: Record<Entity, Spec[]> = {
  categories: [name, slug],
  teachers: [name],
  lessons: [
    { name: "title", kind: "text" },
    { name: "description", kind: "textarea", nullable: true },
    { name: "keyPoints", kind: "lines", hint: "keyPoints" },
    slug,
  ],
  terms: [{ name: "term", kind: "text" }, { name: "shortDefinition", kind: "textarea" }, slug],
  tracks: [name, slug],
  steps: [name, slug],
};

type Raw = Record<string, unknown>;
type Texts = Record<string, string>;
export type EntityFormRecord = Raw & { translations: Partial<Record<Locale, Raw>> };

// Form controls hold text; these convert to and from the saved values.
function toText(spec: Spec, value: unknown): string {
  if (value == null) return "";
  if (spec.kind === "lines") return (value as string[]).join("\n");
  if (spec.kind === "minutes") return String(Math.round((value as number) / 60));
  return String(value);
}
function fromText(spec: Spec, text: string, initial: unknown): unknown {
  const trimmed = text.trim();
  if (spec.kind === "lines") return trimmed ? trimmed.split("\n").map((line) => line.trim()).filter(Boolean) : [];
  if (trimmed === "" && spec.nullable) return null;
  if (spec.kind === "number") return Number(trimmed);
  // An untouched length keeps its seconds.
  if (spec.kind === "minutes") return toText(spec, initial) === trimmed ? initial : Number(trimmed) * 60;
  return trimmed;
}
const texts = (specs: Spec[], values: Raw = {}): Texts =>
  Object.fromEntries(specs.map((spec) => [spec.name, toText(spec, values[spec.name])]));

export function EntityForm({
  entity,
  id,
  initial,
  listHref,
  editHref,
  options = {},
}: {
  entity: Entity;
  id?: string;
  initial: EntityFormRecord;
  listHref: string;
  // Where a newly created entity is edited, without the id.
  editHref: string;
  options?: Partial<Record<"categories" | "teachers", Option[]>>;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const dir = dirOf(useLocale() as Locale);
  const baseSpecs = BASE[entity];
  const rowSpecs = TRANSLATED[entity];

  const [base, setBase] = useState(() => texts(baseSpecs, initial));
  const [rows, setRows] = useState<Partial<Record<Locale, Texts>>>(() =>
    Object.fromEntries(LOCALES.flatMap((locale) => (initial.translations[locale] ? [[locale, texts(rowSpecs, initial.translations[locale])]] : []))),
  );
  const [tab, setTab] = useState<Locale>("he");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "working" | "saved">("idle");
  const [failure, setFailure] = useState("");

  const setRow = (locale: Locale, row: Texts | undefined) => setRows((current) => ({ ...current, [locale]: row }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      ...initial,
      ...Object.fromEntries(baseSpecs.map((spec) => [spec.name, fromText(spec, base[spec.name], initial[spec.name])])),
      translations: Object.fromEntries(
        LOCALES.flatMap((locale) => {
          const row = rows[locale];
          return row ? [[locale, Object.fromEntries(rowSpecs.map((spec) => [spec.name, fromText(spec, row[spec.name], null)]))]] : [];
        }),
      ),
    };

    const fail = (found: Record<string, string>, message: string) => {
      setErrors(found);
      setFailure(message);
      setStatus("idle");
      // Show the first language that has a marked field.
      const locale = LOCALES.find((item) => Object.keys(found).some((path) => path.startsWith(`translations.${item}.`)));
      if (locale) setTab(locale);
    };

    const checked = inputSchemas[entity].safeParse(payload);
    if (!checked.success) {
      const found = Object.fromEntries(
        checked.error.issues.map((issue) => [issue.path.join("."), t(issue.code === "too_small" ? "errors.required" : "errors.invalid")]),
      );
      return fail(found, t("errors.summary"));
    }

    setStatus("working");
    const result = await callCatalog(id ? "PUT" : "POST", id ? `${entity}/${id}` : entity, checked.data);
    if (!result.ok) {
      const message = t.has(`errors.${result.error}`) ? t(`errors.${result.error}`, { count: result.count ?? 0 }) : t("errors.generic");
      const found = Object.fromEntries((result.fields ?? []).map((path) => [path, t("errors.invalid")]));
      if (result.field) found[result.field] = message;
      return fail(found, message);
    }
    setErrors({});
    setFailure("");
    setStatus("saved");
    if (!id && result.id) router.replace(`${editHref}/${result.id}`);
    else router.refresh();
  }

  const input = (spec: Spec, path: string, value: string, onChange: (value: string) => void) => (
    <Field
      key={path}
      id={`field-${path.replaceAll(".", "-")}`}
      label={t(`fields.${spec.name}`)}
      hint={spec.hint && t(`hints.${spec.hint}`)}
      error={errors[path]}
    >
      {(props) => {
        const shared = { ...props, value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) };
        if (spec.kind === "textarea" || spec.kind === "lines") return <textarea {...shared} rows={4} className={control} />;
        if (spec.kind === "select" || spec.kind === "ref") {
          const choices: Option[] =
            spec.kind === "ref"
              ? (options[spec.ref!] ?? []).filter((option) => option.id !== id || spec.ref !== entity)
              : spec.options!.map((option) => ({ id: option, label: t(`${spec.optionLabels!}.${option}`) }));
          return (
            <select {...shared} className={control}>
              {spec.nullable && <option value="">{t("none")}</option>}
              {choices.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }
        const numeric = spec.kind === "number" || spec.kind === "minutes";
        return (
          <input
            {...shared}
            type={numeric ? "number" : "text"}
            min={numeric ? 0 : undefined}
            // Slugs and codes may be in any script; let the text decide its direction.
            dir={numeric ? "ltr" : "auto"}
            className={control}
          />
        );
      }}
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      {failure && (
        <p role="alert" className="rounded-xl border-2 border-red-700 bg-card p-4 font-medium text-red-700">
          {failure}
        </p>
      )}

      {baseSpecs.length > 0 && (
        <div className={`${card} grid gap-4 p-5 sm:grid-cols-2`}>
          {baseSpecs.map((spec) => input(spec, spec.name, base[spec.name], (value) => setBase((current) => ({ ...current, [spec.name]: value }))))}
        </div>
      )}

      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as Locale)} dir={dir} className={`${card} p-5`}>
        <Tabs.List aria-label={t("languages.label")} className="mb-4 flex flex-wrap gap-1 border-b border-line pb-3">
          {LOCALES.map((locale) => (
            <Tabs.Trigger
              key={locale}
              value={locale}
              className="tap inline-flex items-center gap-2 rounded-full px-4 font-medium hover:bg-ink/5 data-[state=active]:bg-green-tint data-[state=active]:text-green"
            >
              <span aria-hidden={locale !== "he"}>{localeNames[locale]}</span>
              <span aria-hidden="true">{rows[locale] ? "✓" : "–"}</span>
              <span className="sr-only">
                {locale === "he"
                  ? t("languages.required")
                  : t(rows[locale] ? "languages.translated" : "languages.missing", { language: localeNames[locale] })}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {LOCALES.map((locale) => {
          const row = rows[locale];
          return (
            <Tabs.Content key={locale} value={locale} className="grid gap-4">
              {row ? (
                <>
                  {rowSpecs.map((spec) =>
                    input(spec, `translations.${locale}.${spec.name}`, row[spec.name], (value) => setRow(locale, { ...row, [spec.name]: value })),
                  )}
                  {locale !== "he" && (
                    <button type="button" className={`${outlineBtn} justify-self-start`} onClick={() => setRow(locale, undefined)}>
                      {t("languages.remove")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted">{t("languages.fallback")}</p>
                  <button
                    type="button"
                    className={`${outlineBtn} justify-self-start`}
                    // The address name starts as the Hebrew one; the rest is typed in.
                    onClick={() => setRow(locale, { ...texts(rowSpecs), ...(rows.he?.slug ? { slug: rows.he.slug } : {}) })}
                  >
                    {t("languages.add")}
                  </button>
                </>
              )}
            </Tabs.Content>
          );
        })}
      </Tabs.Root>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={status === "working"} className={`${primaryBtn} disabled:opacity-60`}>
          {t(id ? "actions.save" : "actions.create")}
        </button>
        <Link href={listHref} className={outlineBtn}>
          {t("actions.back")}
        </Link>
        <p role="status" className="font-medium text-green">
          {status === "working" ? t("messages.working") : status === "saved" ? t("messages.saved") : ""}
        </p>
      </div>
    </form>
  );
}
