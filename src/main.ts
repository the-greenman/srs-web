import "./styles/index.css";
import { mount } from "svelte";
import App from "./App.svelte";

const app = mount(App, {
  // biome-ignore lint/style/noNonNullAssertion: #app is always present in index.html
  target: document.getElementById("app")!,
});

export default app;
