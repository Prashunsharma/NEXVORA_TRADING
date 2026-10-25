// Cloudinary helpers — signing only, no SDK (Node's built-in crypto).
// Used by server.js for the signed-upload endpoint and best-effort destroys,
// and unit-tested in test/project.test.js.
const crypto = require("crypto");

// Cloudinary's signing rule: take the parameters to sign, sort them
// alphabetically by key, join as "key=value" pairs with "&", append the
// API secret, and SHA-1 hash the whole string (hex digest).
function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

// Insert a transformation (e.g. "f_auto,q_auto,w_900") into a Cloudinary
// delivery URL: https://res.cloudinary.com/<cloud>/image/upload/<rest>
// becomes .../image/upload/f_auto,q_auto,w_900/<rest>. Non-Cloudinary URLs
// (and URLs that already carry a transformation) are returned unchanged.
function deliveryUrl(url, transformation) {
  if (typeof url !== "string" || !transformation) return url;
  const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
  if (!match) return url;
  const rest = match[2];
  // A version segment ("v1234/") or a dotted filename marks a bare asset path.
  // If the first segment already looks like a transformation, leave it alone.
  const firstSegment = rest.split("/")[0];
  const looksTransformed = /^[a-z]+_[^/]+/.test(firstSegment) && !/^v\d+$/.test(firstSegment);
  if (looksTransformed) return url;
  return `${match[1]}${transformation}/${rest}`;
}

module.exports = { signParams, deliveryUrl };
