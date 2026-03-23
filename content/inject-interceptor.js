// ============================================
// IOL Salta - Fetch/XHR Interceptor (MAIN world)
// Intercepts API responses AND captures JWT tokens
// from the Angular app's authorization headers
// ============================================

(function() {
  'use strict';

  // ---- Patch fetch ----
  var origFetch = window.fetch;
  window.fetch = function() {
    var input = arguments[0];
    var init = arguments[1] || {};
    var urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    // Capture JWT from outgoing Authorization headers
    captureTokenFromHeaders(init.headers, urlStr);

    return origFetch.apply(this, arguments).then(function(response) {
      // Intercept expediente detail responses
      if (urlStr.indexOf('/iol-api/') !== -1 &&
          urlStr.indexOf('/expedientes/') !== -1 &&
          urlStr.indexOf('/actuaciones') === -1 &&
          urlStr.indexOf('/pdf') === -1) {
        response.clone().json().then(function(json) {
          window.postMessage({
            type: 'IOL_EXT_INTERCEPTED',
            expediente: json || null,
            actuaciones: null,
          }, '*');
        }).catch(function() {});
      }

      // Intercept actuaciones list
      if (urlStr.indexOf('/iol-api/') !== -1 &&
          urlStr.indexOf('/actuaciones') !== -1 &&
          urlStr.indexOf('/pdf') === -1) {
        response.clone().json().then(function(json) {
          var acts = Array.isArray(json) ? json : (json && json.actuaciones ? json.actuaciones : null);
          if (acts) {
            window.postMessage({
              type: 'IOL_EXT_INTERCEPTED',
              expediente: null,
              actuaciones: acts,
            }, '*');
          }
        }).catch(function() {});
      }

      // Intercept login/auth responses that return a token
      if (urlStr.indexOf('/auth/') !== -1 || urlStr.indexOf('/login') !== -1) {
        response.clone().json().then(function(json) {
          var token = json && (json.token || json.access_token || json.jwt);
          if (token) {
            window.postMessage({
              type: 'IOL_EXT_TOKEN',
              token: token,
            }, '*');
          }
        }).catch(function() {});
      }

      return response;
    });
  };

  // ---- Patch XMLHttpRequest ----
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function(method, url) {
    this._iolUrl = url;
    this._iolHeaders = {};
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (this._iolHeaders) this._iolHeaders[name] = value;
    // Capture JWT from Authorization header
    if (name.toLowerCase() === 'authorization' && value.indexOf('Bearer ') === 0) {
      var token = value.substring(7);
      window.postMessage({ type: 'IOL_EXT_TOKEN', token: token }, '*');
    }
    return origSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var xhr = this;

    if (xhr._iolUrl && xhr._iolUrl.indexOf('/iol-api/') !== -1) {
      xhr.addEventListener('load', function() {
        try {
          var json = JSON.parse(xhr.responseText);

          // Expediente detail
          if (xhr._iolUrl.indexOf('/expedientes/') !== -1 &&
              xhr._iolUrl.indexOf('/actuaciones') === -1 &&
              xhr._iolUrl.indexOf('/pdf') === -1) {
            window.postMessage({
              type: 'IOL_EXT_INTERCEPTED',
              expediente: json || null,
              actuaciones: null,
            }, '*');
          }

          // Actuaciones
          if (xhr._iolUrl.indexOf('/actuaciones') !== -1 &&
              xhr._iolUrl.indexOf('/pdf') === -1) {
            var acts = Array.isArray(json) ? json : (json && json.actuaciones ? json.actuaciones : null);
            if (acts) {
              window.postMessage({
                type: 'IOL_EXT_INTERCEPTED',
                expediente: null,
                actuaciones: acts,
              }, '*');
            }
          }

          // Auth response
          if (xhr._iolUrl.indexOf('/auth/') !== -1 || xhr._iolUrl.indexOf('/login') !== -1) {
            var token = json && (json.token || json.access_token || json.jwt);
            if (token) {
              window.postMessage({ type: 'IOL_EXT_TOKEN', token: token }, '*');
            }
          }
        } catch(e) {}
      });
    }

    return origSend.apply(this, arguments);
  };

  // ---- Helper: extract Bearer token from headers ----
  function captureTokenFromHeaders(headers, url) {
    if (!headers || url.indexOf('/iol-api/') === -1) return;
    try {
      var authValue = null;
      if (headers instanceof Headers) {
        authValue = headers.get('Authorization') || headers.get('authorization');
      } else if (Array.isArray(headers)) {
        for (var i = 0; i < headers.length; i++) {
          if (headers[i][0].toLowerCase() === 'authorization') {
            authValue = headers[i][1];
            break;
          }
        }
      } else if (typeof headers === 'object') {
        authValue = headers['Authorization'] || headers['authorization'];
      }
      if (authValue && authValue.indexOf('Bearer ') === 0) {
        var token = authValue.substring(7);
        window.postMessage({ type: 'IOL_EXT_TOKEN', token: token }, '*');
      }
    } catch(e) {}
  }
})();
