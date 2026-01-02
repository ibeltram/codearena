/**
 * VS Code Webview API type declarations
 */

interface VsCodeApi {
  /**
   * Post a message to the extension host
   */
  postMessage(message: unknown): void;

  /**
   * Get the persistent state stored for this webview
   */
  getState(): unknown;

  /**
   * Set the persistent state stored for this webview
   */
  setState(state: unknown): void;
}

/**
 * Acquires an instance of the VS Code API to communicate with the extension host
 */
declare function acquireVsCodeApi(): VsCodeApi;

interface Window {
  acquireVsCodeApi: typeof acquireVsCodeApi;
}
