/*
 * Copyright 2018 The node-fastify-auto-push Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import test from "ava";
import fastify, {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
} from "fastify";
import fp from "fastify-plugin";
import * as http from "http";
import * as http2 from "http2";
import * as path from "path";

import { AutoPushOptions, HttpServer, staticServe } from "../src/index.js";

async function setUpServer<
  Server extends HttpServer,
  Request extends RawRequestDefaultExpression<Server>,
  Response extends RawReplyDefaultExpression<Server>
>(app: FastifyInstance<Server, Request, Response>, port: number) {
  app.register(fp<AutoPushOptions>(staticServe), {
    root: path.join(__dirname, "..", "..", "ts", "test", "static"),
  });
  return app.listen({ port: port });
}

function http2FetchFile(port: number, path: string): Promise<string> {
  return new Promise((resolve) => {
    const session = http2.connect(`http://localhost:${port}`);
    const stream = session.request({ ":path": path });
    stream.setEncoding("utf8");
    stream.on("response", () => {
      let data = "";
      stream
        .on("data", (chunk) => {
          data += chunk;
        })
        .on("end", () => {
          resolve(data);
        });
    });
  });
}

function http1FetchFile(port: number, path: string): Promise<string> {
  return new Promise((resolve) => {
    const req = http.request({ port, path }, (res) => {
      res.setEncoding("utf8");
      let data = "";
      res
        .on("data", (chunk) => {
          data += chunk;
        })
        .on("end", () => {
          resolve(data);
        });
    });
    req.end();
  });
}

test("http2 static file serving", async (t) => {
  /*
   * Const getPort = require("get-port");
   *   const getPort = (await import("get-port")).default;
   */

  const port = 9092; // Await getPort();
  const app = fastify({ http2: true, http2SessionTimeout: 10 });
  await setUpServer(app, port);

  const data = await http2FetchFile(port, "/test.html");
  t.true(data.includes("This is a test document."));
  const closed = await new Promise<boolean>((resolve) => {
    app.close(() => resolve(true));
  });
  t.true(closed);
});

test("http1 static file serving", async (t) => {
  // Const getPort = 9090;//require("get-port");

  //  Const getPort = (await import("get-port")).default;
  const port = 9090;
  // Await getPort();

  const app = fastify({});
  await setUpServer(app, port);

  const data = await http1FetchFile(port, "/test.html");
  t.true(data.includes("This is a test document."));
  const closed = await new Promise<boolean>((resolve) => {
    app.close(() => resolve(true));
  });
  t.true(closed);
});
