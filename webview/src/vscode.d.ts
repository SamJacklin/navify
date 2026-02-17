declare global {
  function acquireVsCodeApi(): {
    postMessage(message: any): void;
    setState(state: any): void;
    getState(): any;
  };

  interface Window {
    __NAVIFY_LOGO__?: string;
  }
}

export {};
