export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Ids come from URLs and request bodies; anything that is not a UUID matches no row.
export const uuidOrNil = (value: string) => (isUuid(value) ? value : NIL_UUID);
