import "dotenv/config";
import { fastify } from "fastify";

const app = fastify();

app.get("/", async () => {
  return { message: "API" };
});

// REGISTER ROUTES HERE

app.listen({
  port: 3333,
});

console.log("Server running: http://localhost:3333");
