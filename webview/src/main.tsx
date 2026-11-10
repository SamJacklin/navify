import { render } from "preact";
import "@vscode/codicons/dist/codicon.css";
import "./styles.css";
import { SearchView } from "./components/SearchView";
import { ExplorerPlus } from "./components/ExplorerPlus";

const root = document.getElementById("app");
if (root) {
  render(window.__NAVIFY_VIEW__ === "explorer" ? <ExplorerPlus /> : <SearchView />, root);
}
