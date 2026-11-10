declare global {
  function acquireVsCodeApi(): {
    postMessage(message: any): void;
    setState(state: any): void;
    getState(): any;
  };

  interface Window {
    /** Which Navify view this webview renders; injected by `src/webview/html.ts`. */
    __NAVIFY_VIEW__?: "search" | "explorer";
  }
}

export {};
