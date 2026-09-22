// Emscripten replaces self.onmessage again while a pthread is initialized.
// Reinstall the Fairy custom-message wrapper whenever that happens.
if (ENVIRONMENT_IS_PTHREAD) {
  console.log("[Fairy trace pthread] postamble active");
  const installFairyMessageHandler = () => {
    const current = self.onmessage;
    if (current && !current.__fairyMessageHandler) {
      const wrapped = (e) => {
        if (e.data?.cmd === "custom") {
          console.log("[Fairy trace pthread] custom received", e.data.userData);
          Module["onCustomMessage"]?.(e.data.userData);
          return;
        }
        current(e);
      };
      wrapped.__fairyMessageHandler = true;
      self.onmessage = wrapped;
      console.log("[Fairy trace pthread] handler installed");
    }
    setTimeout(installFairyMessageHandler, 10);
  };
  installFairyMessageHandler();
}
