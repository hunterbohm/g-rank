import index from "./index.html";

Bun.serve({
  port: Number(process.env.PORT || 3000),
  routes: {
    "/": index,
    "/data/episodes.json": new Response(Bun.file("./data/episodes.json")),
    "/src/app.js": new Response(Bun.file("./src/app.js")),
    "/src/grank.js": new Response(Bun.file("./src/grank.js")),
    "/styles.css": new Response(Bun.file("./styles.css")),
  },
  development: { hmr: true, console: true },
});

console.log("G-Rank running on http://localhost:3000");
