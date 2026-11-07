// Express 4 ignores promises returned by handlers, so a rejected async handler would hang the request.
// Forward the rejection to next() so the error middleware in index.js answers it.
import Layer from 'express/lib/router/layer.js';

const handleRequest = Layer.prototype.handle_request;
Layer.prototype.handle_request = function handle(req, res, next) {
  if (this.handle.length > 3) return handleRequest.call(this, req, res, next);
  try {
    const out = this.handle(req, res, next);
    if (out && typeof out.then === 'function') out.then(undefined, next);
  } catch (e) {
    next(e);
  }
};
