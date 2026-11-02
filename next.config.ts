import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent Toolkit is CommonJS and require()s axios, Node's buffer/os,
  // and @paypal/paypal-server-sdk. Keep that graph on the Node runtime
  // instead of letting webpack polyfill it.
  serverExternalPackages: [
    "@paypal/agent-toolkit",
    "@paypal/paypal-server-sdk",
    "axios",
    "debug",
  ],
};

export default nextConfig;
