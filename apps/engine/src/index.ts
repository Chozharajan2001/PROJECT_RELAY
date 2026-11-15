// @relay/engine — routing simulator worker (EPIC-3 builds the simulation loop).
// Stateless: receives jobs, reports back via POST /internal/routing-callback. Never touches the DB.

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";

// eslint-disable-next-line no-console
console.log(`relay-engine worker stub (API_BASE=${API_BASE}). Simulation loop lands in T-3.1.1.`);
