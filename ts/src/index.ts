// Copyright 2017 The node-fastify-auto-push Authors.
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

import * as cookie from "cookie";
import * as fastify from "fastify";
import {
  FastifyLoggerInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
} from "fastify";
import fastifyStatic from "fastify-static";
import * as autoPush from "h2-auto-push";
import * as http from "http";
import * as http2 from "http2";
import * as https from "https";

export { AssetCacheConfig } from "h2-auto-push";

export type HttpServer =
  | http.Server
  | https.Server
  | http2.Http2Server
  | http2.Http2SecureServer;
export type RawRequest = http.IncomingMessage | http2.Http2ServerRequest;
export type RawResponse = http.ServerResponse | http2.Http2ServerResponse;

export interface AutoPushOptions extends fastify.RegisterOptions {
  root: string;
  prefix?: string;
  cacheConfig?: autoPush.AssetCacheConfig;
}

function isHttp2Request(req: RawRequest): req is http2.Http2ServerRequest {
  return !!(req as http2.Http2ServerRequest).stream;
}

function isHttp2Response(res: RawResponse): res is http2.Http2ServerResponse {
  return !!(res as http2.Http2ServerResponse).stream;
}

const CACHE_COOKIE_KEY = "__ap_cache__";

export async function staticServeFn<
  Server extends RawServerBase,
  Request extends RawRequestDefaultExpression<Server>,
  Response extends RawReplyDefaultExpression<Server>,
  Logger extends FastifyLoggerInstance
>(
  app: fastify.FastifyInstance<Server, Request, Response, Logger>,
  opts: AutoPushOptions
): Promise<void> {
  const root = opts.root;
  const prefix = opts.prefix || "/";
  const ap = new autoPush.AutoPush(root, opts.cacheConfig);

  app.register(fastifyStatic, opts);

  app.addHook("onRequest", async (req, res) => {
    // Used for compatibility with fastify 1.x and 2.0
    const rawRequest = req.raw || req;
    const rawResponse = res.raw || res;
    if (isHttp2Request(rawRequest)) {
      const reqPath = rawRequest.url;
      const reqStream = rawRequest.stream;
      const cookies = cookie.parse(
        (rawRequest.headers["cookie"] as string) || ""
      );
      const cacheKey = cookies[CACHE_COOKIE_KEY];
      const { newCacheCookie, pushFn } = await ap.preprocessRequest(
        reqPath,
        reqStream,
        cacheKey
      );
      // TODO(jinwoo): Consider making this persistent across sessions.
      rawResponse.setHeader(
        "set-cookie",
        cookie.serialize(CACHE_COOKIE_KEY, newCacheCookie, { path: "/" })
      );

      reqStream.on("pushError", (err) => {
        req.log?.error("Error while pushing", err);
      });
      pushFn().then(noop, noop);
    }
  });

  app.addHook("onSend", async (request, reply) => {
    const raw = reply.raw;
    if (isHttp2Response(raw)) {
      const statusCode = raw.statusCode;
      const resStream = raw.stream;
      const reqPath = request.raw.url;
      if (statusCode === 404 && reqPath) {
        ap.recordRequestPath(resStream.session, reqPath, false);
      } else if (
        statusCode < 300 &&
        statusCode >= 200 &&
        reqPath &&
        // Record as a static file only when the path starts with `prefix`.
        reqPath.startsWith(prefix)
      ) {
        ap.recordRequestPath(resStream.session, reqPath, true);
      }
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
function noop() {}

// This type is probably not useful. Users probably want to call fp to
// instantiate the plugin specifically for their specific Http server, request
// and response types rather than using the union types like we do here.
/*
export const staticServe = fp<
  HttpServer,
  RawRequest,
  RawResponse,
  AutoPushOptions<HttpServer, RawRequest, RawResponse>
>(staticServeFn);
*/
