"use client";

import { useSyncExternalStore } from "react";

const noSubscription = () => () => {};

// TEST ONLY (see page.tsx): renders on the server, then fails in the browser.
export function ClientFailure() {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  if (inBrowser) throw new Error("dev-error-sentinel");
  return null;
}
