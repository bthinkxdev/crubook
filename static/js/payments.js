/**
 * Shared Razorpay checkout for author.thinks
 * Requires checkout.razorpay.com/v1/checkout.js
 */
(function (global) {
  "use strict";

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

  /**
   * @param {object} opts
   * @param {string} opts.bookSlug
   * @param {string} [opts.productType] download | online
   * @param {string} [opts.createUrl]
   * @param {string} [opts.verifyUrl]
   * @param {function} [opts.onSuccess]
   * @param {function} [opts.onDismiss]
   * @param {function} [opts.onError]
   */
  function startCheckout(opts) {
    opts = opts || {};
    var bookSlug = opts.bookSlug;
    var productType = opts.productType || "download";
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
          var rzp = new global.Razorpay({
            key: order.key,
            amount: order.amount,
            currency: order.currency,
            name: order.name || "author.thinks",
            description: order.description || "",
            order_id: order.order_id,
            theme: order.theme || { color: "#2C2A27" },
            handler: function (response) {
              postJSON(verifyUrl, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              })
                .then(function (verifyResult) {
                  if (!verifyResult.ok || !verifyResult.data || !verifyResult.data.ok) {
                    var msg =
                      (verifyResult.data && verifyResult.data.error) ||
                      "Payment could not be verified.";
                    if (opts.onError) opts.onError(msg);
                    resolve({ ok: false });
                    return;
                  }
                  if (opts.onSuccess) opts.onSuccess(verifyResult.data);
                  resolve({ ok: true, data: verifyResult.data });
                })
                .catch(function () {
                  if (opts.onError) {
                    opts.onError("Payment received but verification failed. Contact support.");
                  }
                  resolve({ ok: false });
                });
            },
            modal: {
              ondismiss: function () {
                if (opts.onDismiss) opts.onDismiss();
                resolve({ ok: false, dismissed: true });
              },
            },
          });

          rzp.on("payment.failed", function (response) {
            var desc =
              (response && response.error && response.error.description) ||
              "Payment failed.";
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
  };
})(window);
