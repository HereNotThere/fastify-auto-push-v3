// Copyright 2018 The node-fastify-auto-push Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const { ArgumentParser } = require("argparse");
const fastify = require("fastify");
const fastifyAutoPush = require("fastify-auto-push");
const fastifyStatic = require("@fastify/static");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const { description, version } = require("./package.json");

const argParser = new ArgumentParser({
  description,
  add_help: true,
});
argParser.add_argument("--port", "-p", {
  type: Number,
  default: 3000,
  help: "Port number. Defaults to 3000.",
});
argParser.add_argument("--http2", "--h2", {
  default: true,
  help: "Use HTTP/2. Defaults to true.",
});
argParser.add_argument("--auto-push", "--ap", {
  dest: "autoPush",
  help: "Enable auto-push. Works only with --http2.",
});
const args = argParser.parse_args();
if (args.autoPush && !args.http2) {
  console.warn("--auto-push is supported only with --http2. Ignoring.");
  args.autoPush = false;
}

const fsReadFile = promisify(fs.readFile);

const STATIC_DIR = path.join(__dirname, "..", "..", "third_party", "wikipedia");
const CERTS_DIR = path.join(__dirname, "certs");

async function createServerOptions() {
  const readCertFile = (filename) => {
    return fsReadFile(path.join(CERTS_DIR, filename));
  };
  const [key, cert] = await Promise.all([
    readCertFile("key.pem"),
    readCertFile("cert.pem"),
  ]);
  return { key, cert };
}

async function main() {
  const { key, cert } = await createServerOptions();
  const app = fastify({
    https: { key, cert },
    http2: args.http2,
  });
  if (args.autoPush) {
    // Create and register AutoPush plugin. It should be registered as the first
    // in the middleware chain.
    app.register(fastifyAutoPush.staticServe, { root: STATIC_DIR });
  } else {
    app.register(fastifyStatic, { root: STATIC_DIR });
  }
  app.listen({ port: args.port }, (err) => {
    if (err) throw err;
    console.log(`Listening on port ${args.port}`);
  });
}

main().catch((err) => {
  console.error(err);
});
