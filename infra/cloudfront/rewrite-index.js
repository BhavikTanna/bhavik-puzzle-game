// CloudFront Function (viewer request) for the /brickwords behaviours.
//
// CloudFront's DefaultRootObject only resolves "/" — it does nothing for a
// sub-directory. Without this, a request for /brickwords/ asks S3 for a key
// that does not exist, S3 404s, and the distribution's own custom error
// response serves the CV's index.html instead. Custom error responses are
// distribution-wide, not per-behaviour, so they cannot be overridden for this
// path; the only fix is to never let the origin 404 in the first place.
//
// Attach to the /brickwords and /brickwords/* behaviours ONLY. Attaching it to
// the default behaviour would change how the CV resolves its own URLs.
//
// Deliberately ES5: CloudFront Functions runtime 1.0 has no endsWith/includes.
//
// The name is fixed: the CloudFront Functions runtime calls a global "handler".
// Nothing in this repo references it, hence the disable.
// eslint-disable-next-line no-unused-vars
function handler(event) {
  var request = event.request
  var uri = request.uri
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1)

  // A last segment containing a dot is a real file (index.html, index-a1b2.js)
  // and is passed straight through. Anything else is a directory-style URL:
  //   /brickwords      -> /brickwords/index.html
  //   /brickwords/     -> /brickwords/index.html
  if (lastSegment.indexOf('.') === -1) {
    request.uri = lastSegment === '' ? uri + 'index.html' : uri + '/index.html'
  }

  return request
}
