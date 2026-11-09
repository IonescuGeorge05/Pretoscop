// The few extension APIs the extension uses (Chrome and Firefox both provide them on `chrome`).
// Declared here instead of depending on @types/chrome.
declare namespace chrome.runtime {
  const id: string;
  const lastError: { message?: string } | undefined;
  interface MessageSender {
    id?: string;
    url?: string;
    origin?: string;
    frameId?: number;
    tab?: { id?: number; url?: string };
  }
  function sendMessage(message: unknown, callback: (response: unknown) => void): void;
  const onMessage: {
    addListener(callback: (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => boolean | undefined): void;
  };
}
