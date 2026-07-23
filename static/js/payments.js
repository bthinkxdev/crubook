/**
 * Shared Razorpay checkout for author.thinks
 * Secure verify with retries + preparing overlay before fulfill.
 */
(function (global) {
  "use strict";

  var PREPARE_MS = 3000;
  var VERIFY_RETRIES = 3;

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function loadCheckoutScript() {
    return new Promise(function (resolve, reject) {
      if (global.Razorpay) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[src*="checkout.razorpay.com"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", reject);
        return;
      }
      var script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = function () {
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function postJSON(url, payload) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function ensurePrepareOverlay() {
    var el = document.getElementById("prepareOverlay");
    if (el) return el;
    el = document.createElement("div");
    el.id = "prepareOverlay";
    el.className = "prepare-overlay";
    el.hidden = true;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<div class="prepare-card">' +
      '<div class="prepare-spinner" aria-hidden="true"></div>' +
      '<h3 class="prepare-title">Preparing…</h3>' +
      '<p class="prepare-text">Just a moment</p>' +
      "</div>";
    document.body.appendChild(el);
    return el;
  }

  function showPrepareOverlay(productType) {
    var el = ensurePrepareOverlay();
    var title = el.querySelector(".prepare-title");
    var text = el.querySelector(".prepare-text");
    if (productType === "online") {
      if (title) title.textContent = "Preparing your reader…";
      if (text) text.textContent = "Unlocking access — almost ready.";
    } else {
      if (title) title.textContent = "Preparing your download…";
      if (text) text.textContent = "Getting your PDF ready.";
    }
    el.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hidePrepareOverlay() {
    var el = document.getElementById("prepareOverlay");
    if (el) el.hidden = true;
  }

  function triggerDownload(url) {
    if (!url) return;
    var link = document.createElement("a");
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function verifyWithRetry(verifyUrl, payload) {
    var attempt = 0;

    function run() {
      attempt += 1;
      return postJSON(verifyUrl, payload).then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          return result;
        }
        // 409 after concurrent finalize — if payload says ok elsewhere, still retry once
        if (attempt < VERIFY_RETRIES) {
          return sleep(400 * attempt).then(run);
        }
        return result;
      }).catch(function (err) {
        if (attempt < VERIFY_RETRIES) {
          return sleep(400 * attempt).then(run);
        }
        throw err;
      });
    }

    return run();
  }

  function prepareThenFulfill(data, opts) {
    showPrepareOverlay(data.product_type || opts.productType || "download");
    return sleep(PREPARE_MS).then(function () {
      hidePrepareOverlay();
      if (data.download_url) {
        triggerDownload(data.download_url);
      }
      if (opts.onSuccess) opts.onSuccess(data);
      return { ok: true, data: data };
    });
  }

  /**
   * @param {object} opts
   * @param {string} opts.bookSlug
   * @param {string} [opts.productType] download | online
   * @param {string} [opts.email]
   * @param {function} [opts.onSuccess]
   * @param {function} [opts.onDismiss]
   * @param {function} [opts.onError]
   */
  function startCheckout(opts) {
    opts = opts || {};
    var bookSlug = opts.bookSlug;
    var productType = opts.productType || "download";
    var email = (opts.email || "").trim();
    var createUrl =
      opts.createUrl ||
      document.body.getAttribute("data-payment-create-url") ||
      "/payments/create-order/";
    var verifyUrl =
      opts.verifyUrl ||
      document.body.getAttribute("data-payment-verify-url") ||
      "/payments/verify/";

    if (!bookSlug) {
      if (opts.onError) opts.onError("Missing book.");
      return Promise.resolve();
    }

    return loadCheckoutScript()
      .then(function () {
        return postJSON(createUrl, {
          book_slug: bookSlug,
          product_type: productType,
          email: email,
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.ok) {
          var err =
            (result.data && result.data.error) ||
            "Could not start payment. Please try again.";
          if (opts.onError) opts.onError(err);
          return;
        }

        var order = result.data;
        return new Promise(function (resolve) {
          var settled = false;
          function finish(value) {
            if (settled) return;
            settled = true;
            resolve(value);
          }

          var rzp = new global.Razorpay({
            key: order.key,
            amount: order.amount,
            currency: order.currency,
            name: order.name || "author.thinks",
            description: order.description || "",
            order_id: order.order_id,
            prefill: order.prefill || {},
            theme: order.theme || { color: "#2C2A27" },
            retry: { enabled: true, max_count: 3 },
            handler: function (response) {
              verifyWithRetry(verifyUrl, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                email: email,
              })
                .then(function (verifyResult) {
                  if (!verifyResult.ok || !verifyResult.data || !verifyResult.data.ok) {
                    var msg =
                      (verifyResult.data && verifyResult.data.error) ||
                      "Payment could not be verified. If money was deducted, tap Pay again — we will confirm safely.";
                    if (opts.onError) opts.onError(msg);
                    finish({ ok: false });
                    return;
                  }
                  return prepareThenFulfill(verifyResult.data, opts).then(finish);
                })
                .catch(function () {
                  if (opts.onError) {
                    opts.onError(
                      "Payment received but confirmation failed. Please retry — it is safe and will not double-charge."
                    );
                  }
                  finish({ ok: false });
                });
            },
            modal: {
              ondismiss: function () {
                if (opts.onDismiss) opts.onDismiss();
                finish({ ok: false, dismissed: true });
              },
            },
          });

          rzp.on("payment.failed", function (response) {
            var desc =
              (response && response.error && response.error.description) ||
              "Payment failed. You can retry safely.";
            if (opts.onError) opts.onError(desc);
          });

          rzp.open();
        });
      })
      .catch(function () {
        if (opts.onError) {
          opts.onError("Unable to load Razorpay checkout. Check your connection.");
        }
      });
  }

  global.AuthorThinksPayments = {
    startCheckout: startCheckout,
    getCookie: getCookie,
    showPrepareOverlay: showPrepareOverlay,
    hidePrepareOverlay: hidePrepareOverlay,
  };
})(window);
