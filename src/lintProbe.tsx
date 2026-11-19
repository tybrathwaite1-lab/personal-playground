// M2-7 negative demonstration only: a lint *warning* (react-hooks/exhaustive-deps) that must
// fail CI. Reverted in the next commit.
import { useEffect } from 'react';

export function LintProbe({ id }: { id: string }) {
  useEffect(() => {
    console.log(id);
  }, []);
  return null;
}
