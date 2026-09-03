"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Phase 5 polish: without this, an uncaught render error anywhere in
 * the tree unmounts the whole React app and the user sees a blank
 * white page with no way forward except a manual refresh. Wraps each
 * page's content (see AppShell) so one broken view degrades to a
 * clear, Turkish, in-place error message instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("CaseBridge: caught a render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-start gap-1 rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-700">
          <span className="font-medium">Bir sorun oluştu</span>
          <span>Bu sayfa yüklenirken beklenmeyen bir hata oluştu. Sayfayı yenilemeyi deneyin.</span>
        </div>
      );
    }
    return this.props.children;
  }
}
