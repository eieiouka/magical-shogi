const fs = require("fs");

const filename = process.argv[2] || "stockfish.js";
let source = fs.readFileSync(filename, "utf8");
const messageMarker = "// FAIRY_CUSTOM_MESSAGE_HANDLER";
const urlMarker = "// FAIRY_PTHREAD_SCRIPT_URL";

const needle = /(      } else if \(cmd\) \{\r?\n)(        \/\/ The received message looks like something that should be handled by this message)/;
const replacement = `      } else if (cmd === "custom") {
        // FAIRY_CUSTOM_MESSAGE_HANDLER
        console.log("[Fairy pthread] received", msgData.userData);
        Module["queue"].put(msgData.userData);
      } else if (cmd) {
        // The received message looks like something that should be handled by this message`;

if (!source.includes(messageMarker)) {
  if (!needle.test(source)) {
    throw new Error("Emscripten pthread message-handler insertion point was not found");
  }
  source = source.replace(needle, replacement);
}

const urlNeedle = "    var pthreadMainJs = _scriptName;";
const urlReplacement = `    // FAIRY_PTHREAD_SCRIPT_URL
    var pthreadMainJs = Module["pthreadMainScript"] || _scriptName;`;

if (!source.includes(urlMarker)) {
  if (!source.includes(urlNeedle)) {
    throw new Error("Emscripten pthread script URL insertion point was not found");
  }
  source = source.replace(urlNeedle, urlReplacement);
}

fs.writeFileSync(filename, source, "utf8");
