//
// Post custom message to all workers (including main worker)
//
const pendingCustomMessages = [];
let customMessageRetry = null;

function flushCustomMessages() {
  if (typeof PThread !== "undefined" && PThread.runningWorkers?.length > 0) {
    while (pendingCustomMessages.length > 0) {
      const data = pendingCustomMessages.shift();
      for (const worker of PThread.runningWorkers) {
        worker.postMessage({ "cmd": "custom", "userData": data });
      }
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
    if (this.list.length > 0) {
      return this.list.shift();
    }
    return await new Promise((resolve) => (this.getter = resolve));
  }
  put(x) {
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

Module["terminate"] = () => {
  PThread.terminateAllThreads();
};
