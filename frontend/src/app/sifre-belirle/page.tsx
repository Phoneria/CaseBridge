import { Suspense } from "react";

import { SetPasswordView } from "@/components/auth/SetPasswordView";

export default function SetPasswordPage() {
  // SetPasswordView reads the link from the query string (useSearchParams).
  return (
    <Suspense fallback={null}>
      <SetPasswordView />
    </Suspense>
  );
}
