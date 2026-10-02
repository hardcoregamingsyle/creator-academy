import { useState } from "react";

/**
 * Returns `value`, or the last defined value while `value` is undefined. `useApi` clears its data when the path
 * changes (a new filter or tab), so pages use this to keep the old content on screen until the new response lands.
 */
export function useKeepPrevious<T>(value: T | undefined): T | undefined {
  const [kept, setKept] = useState<T | undefined>(value);
  if (value !== undefined && value !== kept) setKept(value);
  return value ?? kept;
}
