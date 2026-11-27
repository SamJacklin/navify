import { render } from "preact";
import "@vscode/codicons/dist/codicon.css";
import "./styles.css";
import { SearchView } from "./components/SearchView";
import { ExplorerPlus } from "./components/ExplorerPlus";
import { StructureView } from "./components/StructureView";

const views = {
  search: SearchView,
  structure: StructureView,
  explorer: ExplorerPlus,
};

const root = document.getElementById("app");
if (root) {
  const View = views[window.__NAVIFY_VIEW__ ?? "search"];
  render(<View />, root);
}
