// Healthcheck for the single-node replica set (docker-compose.yml → mongodb).
// Initiates `rs0` on first boot (idempotent) and exits non-zero until the node
// is PRIMARY, so `service_healthy` means "transactions are available".
//
// The member host is `localhost:27017` so host-side clients can connect with
// `?directConnection=true` (see MONGODB_URI in .env.example).
try {
  rs.status();
} catch (error) {
  if (error.codeName !== "NotYetInitialized") {
    throw error;
  }
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
}

if (!db.hello().isWritablePrimary) {
  quit(1);
}
