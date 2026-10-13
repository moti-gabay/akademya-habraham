"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Entity } from "@/server/catalog/schemas";
import { card, outlineBtn, primaryBtn } from "../ui";
import { callCatalog } from "./api";

// Publish or unpublish (lessons and paths), and delete, for the entity being edited.
export function RecordActions({
  entity,
  id,
  name,
  status,
  listHref,
}: {
  entity: Entity;
  id: string;
  name: string;
  // Set for entities that are published; others only show the delete button.
  status?: string;
  listHref: string;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [failure, setFailure] = useState("");
  const [working, setWorking] = useState(false);

  async function run(method: "POST" | "DELETE", path: string, then: () => void) {
    setWorking(true);
    const result = await callCatalog(method, path);
    setWorking(false);
    if (result.ok) {
      setFailure("");
      then();
    } else {
      setFailure(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`, { count: result.count ?? 0 }) : t("errors.generic"));
    }
  }

  const published = status === "published";
  return (
    <section className={`${card} grid gap-3 p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        {status && (
          <>
            <p className="font-medium">
              {t("status.label")}: <span className={published ? "text-green" : "text-gold"}>{t(`status.${status}`)}</span>
            </p>
            <button
              type="button"
              disabled={working}
              className={`${published ? outlineBtn : primaryBtn} disabled:opacity-60`}
              onClick={() => run("POST", `${entity}/${id}/${published ? "unpublish" : "publish"}`, () => router.refresh())}
            >
              {t(published ? "actions.unpublish" : "actions.publish")}
            </button>
          </>
        )}
        <button
          type="button"
          disabled={working}
          className={`${outlineBtn} ms-auto border-red-700 text-red-700 disabled:opacity-60`}
          onClick={() => {
            if (window.confirm(t("actions.confirmDelete", { name }))) run("DELETE", `${entity}/${id}`, () => router.replace(listHref));
          }}
        >
          {t("actions.delete")}
        </button>
      </div>
      {failure && (
        <p role="alert" className="font-medium text-red-700">
          {failure}
        </p>
      )}
    </section>
  );
}
