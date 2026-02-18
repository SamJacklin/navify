import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

export function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

/**
 * Loads `media/webview/index.html`, replaces all `{{TOKEN}}` placeholders,
 * and returns the final HTML string ready to assign to `webview.html`.
 *
 * Placeholders in the template:
 *   {{CSP}}        — full Content-Security-Policy header value
 *   {{STYLE_URI}}  — webview URI for main.css
 *   {{NONCE}}      — CSP nonce (appears twice: inline script + main script)
 *   {{LOGO_URI}}   — JSON-encoded logo URI injected as window.__NAVIFY_LOGO__
 *   {{SCRIPT_URI}} — webview URI for main.js
 */
export async function getHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): Promise<string> {
  const nonce = getNonce();

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "webview", "dist", "main.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "webview", "dist", "main.css")
  );
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "logo.png")
  );

  const csp = [
    "default-src 'none';",
    `img-src ${webview.cspSource} https: data:;`,
    `style-src ${webview.cspSource};`,
    `script-src 'nonce-${nonce}';`,
  ].join(" ");

  const templatePath = path.join(
    extensionUri.fsPath,
    "media",
    "webview",
    "index.html"
  );
  const template = await fs.readFile(templatePath, "utf8");

  const replacements: Record<string, string> = {
    "{{CSP}}": csp,
    "{{STYLE_URI}}": styleUri.toString(),
    "{{NONCE}}": nonce,
    // JSON.stringify produces a quoted, escaped JS string literal.
    "{{LOGO_URI}}": JSON.stringify(logoUri.toString()),
    "{{SCRIPT_URI}}": scriptUri.toString(),
  };

  return Object.entries(replacements).reduce(
    // split/join avoids special-character interpretation in replacement strings.
    (html, [token, value]) => html.split(token).join(value),
    template
  );
}
