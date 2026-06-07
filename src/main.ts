import { mount } from "svelte";
import App from "./App.svelte";
import "./styles/index.css";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Missing #app mount target in index.html");
}

const app = mount(App, { target });

export default app;
