"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { card, outlineBtn, primaryBtn } from "../ui";
import { callCatalog } from "./api";
import { control } from "./Field";

type Option = { id: string; label: string };
const small = `${outlineBtn} px-3 text-sm disabled:opacity-40`;

// An ordered list saved as a whole: a lesson's glossary terms, a step's lessons, or the
// steps of a path (`fixed`: the items can only be moved, not added or removed).
export function OrderedList({
  title,
  path,
  options,
  initial,
  fixed = false,
}: {
  title: string;
  // API path the id list is posted to, e.g. "lessons/<id>/terms".
  path: string;
  options: Option[];
  initial: string[];
  fixed?: boolean;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const selectId = useId();
  const [ids, setIds] = useState(initial);
  const [adding, setAdding] = useState("");
  const [message, setMessage] = useState<{ failed: boolean; text: string } | null>(null);
  const [working, setWorking] = useState(false);

  const labelOf = (id: string) => options.find((option) => option.id === id)?.label ?? id;
  const available = options.filter((option) => !ids.includes(option.id));
  const move = (index: number, by: -1 | 1) =>
    setIds((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  async function save() {
    setWorking(true);
    const result = await callCatalog("POST", path, ids);
    setWorking(false);
    if (result.ok) {
      setMessage({ failed: false, text: t("messages.saved") });
      router.refresh();
    } else {
      setMessage({ failed: true, text: t.has(`errors.${result.error}`) ? t(`errors.${result.error}`, { count: 0 }) : t("errors.generic") });
    }
  }

  return (
    <section className={`${card} grid gap-4 p-5`}>
      <h2 className="text-lg font-medium">{title}</h2>
      {ids.length === 0 ? (
        <p className="text-muted">{t(fixed ? "sections.steps.empty" : "links.empty")}</p>
      ) : (
        <ol className="grid gap-2">
          {ids.map((id, index) => (
            <li key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 ps-4">
              <span className="min-w-0 flex-1 basis-48">{t("links.position", { position: index + 1, name: labelOf(id) })}</span>
              <button type="button" className={small} disabled={index === 0} onClick={() => move(index, -1)}>
                {t("actions.moveUp")}
                <span className="sr-only">: {labelOf(id)}</span>
              </button>
              <button type="button" className={small} disabled={index === ids.length - 1} onClick={() => move(index, 1)}>
                {t("actions.moveDown")}
                <span className="sr-only">: {labelOf(id)}</span>
              </button>
              {!fixed && (
                <button type="button" className={small} onClick={() => setIds((current) => current.filter((item) => item !== id))}>
                  {t("actions.remove")}
                  <span className="sr-only">: {labelOf(id)}</span>
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {!fixed && available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor={selectId} className="mb-1 block font-medium">
              {t("links.addLabel")}
            </label>
            <select id={selectId} value={adding} onChange={(event) => setAdding(event.target.value)} className={control}>
              <option value="">{t("actions.choose")}</option>
              {available.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={outlineBtn}
            disabled={!adding}
            onClick={() => {
              setIds((current) => [...current, adding]);
              setAdding("");
            }}
          >
            {t("actions.add")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={`${primaryBtn} disabled:opacity-60`} disabled={working} onClick={save}>
          {t(fixed ? "actions.saveOrder" : "actions.saveList")}
        </button>
        <p role={message?.failed ? "alert" : "status"} className={`font-medium ${message?.failed ? "text-red-700" : "text-green"}`}>
          {message?.text}
        </p>
      </div>
    </section>
  );
}
