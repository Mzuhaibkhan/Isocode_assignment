import { buildServer } from "./server.js";
import { config } from "./config.js";

async function main() {
  const server = buildServer();

  try {
    const address = await server.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });
    console.log(`Procurement API server listening at ${address}`);
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();

