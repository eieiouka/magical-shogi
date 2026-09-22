//
// Post custom message to all workers (including main worker)
//
const pendingCustomMessages = [];
let customMessageRetry = null;
let uciWorker = null;
let uciWorkerDetectedAt = 0;

function flushCustomMessages() {
  if (!uciWorker && typeof PThread !== "undefined") {
    uciWorker = Object.values(PThread.pthreads ?? {})[0] ?? null;
    if (uciWorker) {
      uciWorkerDetectedAt = performance.now();
      console.log("[Fairy trace parent] pthread detected");
    }
  }
  if (uciWorker && performance.now() - uciWorkerDetectedAt >= 100) {
    while (pendingCustomMessages.length > 0) {
      const data = pendingCustomMessages.shift();
      console.log("[Fairy trace parent] send custom", data);
      uciWorker.postMessage({ "cmd": "custom", "userData": data });
    }
    customMessageRetry = null;
    return;
  }
  customMessageRetry = setTimeout(flushCustomMessages, 10);
}

Module["postCustomMessage"] = (data) => {
  pendingCustomMessages.push(data);
  if (customMessageRetry === null) flushCustomMessages();
};

//
// Simple queue with async get (assume single consumer)
//
class Queue {
  constructor() {
    this.getter = null;
    this.list = [];
  }
  async get() {
    console.log("[Fairy trace queue] get requested; queued=", this.list.length);
    if (this.list.length > 0) {
      const value = this.list.shift();
      console.log("[Fairy trace queue] get immediate", value);
      return value;
    }
    return await new Promise((resolve) => (this.getter = (value) => {
      console.log("[Fairy trace queue] get resumed", value);
      resolve(value);
    }));
  }
  put(x) {
    console.log("[Fairy trace queue] put", x);
    if (this.getter) {
      this.getter(x);
      this.getter = null;
      return;
    }
    this.list.push(x);
  }
}

//
// TODO: This is used only by main worker
//
Module["queue"] = new Queue();

Module["onCustomMessage"] = (data) => {
  console.log("[Fairy trace pthread] onCustomMessage", data);
  Module["queue"].put(data);
};

//
// API
//

// Align to the same API as niklasf's stockfish
Module["postMessage"] = Module["postCustomMessage"];

const listeners = [];

Module["addMessageListener"] = (listener) => {
  listeners.push(listener);
};

Module["removeMessageListener"] = (listener) => {
  const i = listeners.indexOf(listener);
  if (i >= 0) {
    listeners.splice(i, 1);
  }
};

// On pthreads, leave print/printErr undefined. Emscripten will install proxy
// handlers that forward engine output to the parent Module's print callback.
if (!ENVIRONMENT_IS_PTHREAD) {
  Module["print"] = Module["printErr"] = (data) => {
    if (typeof Module["onEngineLine"] === "function") {
      Module["onEngineLine"](data);
      return;
    }
    if (listeners.length === 0) {
      console.log(data);
      return;
    }
    for (let listener of listeners) {
      listener(data);
    }
  };
}

Module["terminate"] = () => {
  PThread.terminateAllThreads();
};
