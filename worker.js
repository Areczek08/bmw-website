import fs from "node:fs";

if (typeof process !== "undefined") {
  try {
    if (!process.version || process.version === "") {
      Object.defineProperty(process, 'version', { value: 'v20.18.0', configurable: true });
    }
    if (process.versions && !process.versions.node) {
      Object.defineProperty(process.versions, 'node', { value: '20.18.0', configurable: true });
    }
  } catch (e) {}
}

try {
  if (fs) {
    fs.readdir = (path, options, callback) => {
      const cb = typeof options === 'function' ? options : callback;
      if (cb) cb(null, []);
      return Promise.resolve([]);
    };
    fs.readdirSync = () => [];
    if (fs.promises) {
      fs.promises.readdir = async () => [];
    }
  }
} catch (e) {}

try {
  if (typeof crypto !== "undefined") {
    delete crypto.hkdf;
    delete crypto.hkdfSync;
  }
} catch (e) {}

export * from "./.open-next/worker.js";
export { default } from "./.open-next/worker.js";
