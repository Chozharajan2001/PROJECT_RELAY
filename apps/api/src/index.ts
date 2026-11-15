import express from "express";

const PORT = Number(process.env.API_PORT ?? 3001);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "relay-api", version: "0.1.0" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`relay-api listening on :${PORT}`);
});
