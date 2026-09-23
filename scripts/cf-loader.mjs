export function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      shortCircuit: true,
      url: new URL("../lib/realtime/node-cf-mock.js", import.meta.url).href
    };
  }
  return nextResolve(specifier, context);
}
