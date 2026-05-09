import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastContainer, toast } from "react-toastify";
import App from "./App.jsx";
import "./index.css";
import "react-toastify/dist/ReactToastify.css";

if (typeof window !== "undefined" && !window.__navbatToastAlertPatched) {
  window.__navbatToastAlertPatched = true;
  window.alert = (message) => {
    toast.info(String(message || ""));
  };
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <ToastContainer position="top-right" autoClose={2600} newestOnTop />
  </StrictMode>
);
