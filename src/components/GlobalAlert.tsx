"use client";

import { Toaster } from "react-hot-toast";

export default function GlobalAlert() {
  return (
    <Toaster
      position="top-center"
      gutter={16}
      containerClassName="pointer-events-none"
      containerStyle={{ top: 16 }}
      toastOptions={{
        duration: 5000,
        className: "",
        style: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
          border: "none",
        },
      }}
    />
  );
}


