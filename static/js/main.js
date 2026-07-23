(function () {
  "use strict";

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : "";
  }

  /* ---------- Reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("in-view");
    });
  }

  /* ---------- Topbar hide on scroll ---------- */
  var topbar = document.getElementById("topbar");
  var lastY = window.scrollY;
  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    if (topbar) {
      if (y > lastY && y > 120) topbar.classList.add("hide");
      else topbar.classList.remove("hide");
    }
    lastY = y;
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    },
    { passive: true }
  );

  /* ---------- Side menu ---------- */
  var menuBtn = document.getElementById("menuBtn");
  var menuClose = document.getElementById("menuClose");
  var sideMenu = document.getElementById("sideMenu");
  var menuBackdrop = document.getElementById("menuBackdrop");

  function openMenu() {
    if (!sideMenu || !menuBackdrop) return;
    sideMenu.classList.add("open");
    sideMenu.setAttribute("aria-hidden", "false");
    menuBackdrop.hidden = false;
    requestAnimationFrame(function () {
      menuBackdrop.classList.add("open");
    });
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeMenu() {
    if (!sideMenu || !menuBackdrop) return;
    sideMenu.classList.remove("open");
    sideMenu.setAttribute("aria-hidden", "true");
    menuBackdrop.classList.remove("open");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    setTimeout(function () {
      if (!menuBackdrop.classList.contains("open")) menuBackdrop.hidden = true;
    }, 400);
  }

  if (menuBtn) menuBtn.addEventListener("click", openMenu);
  if (menuClose) menuClose.addEventListener("click", closeMenu);
  if (menuBackdrop) menuBackdrop.addEventListener("click", closeMenu);
  document.querySelectorAll("[data-close-menu]").forEach(function (el) {
    el.addEventListener("click", closeMenu);
  });

  /* ---------- Tab bar: home-page section spy only ---------- */
  var tabs = document.querySelectorAll(".tab[data-tab]");
  var homeSections = ["home", "books", "thoughts", "about-preview"]
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);

  function setActiveTab(id) {
    if (id === "about-preview") id = "about";
    tabs.forEach(function (tab) {
      if (tab.getAttribute("data-tab") === "contact") return;
      tab.classList.toggle("is-active", tab.getAttribute("data-tab") === id);
    });
  }

  if ("IntersectionObserver" in window && homeSections.length) {
    var tabIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setActiveTab(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: 0 }
    );
    homeSections.forEach(function (sec) {
      tabIo.observe(sec);
    });
  }

  /* ---------- Toast ---------- */
  var toast = document.getElementById("toast");
  var toastText = document.getElementById("toastText");
  var toastTimer;

  function showToast(msg) {
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  /* ---------- Carousel drag + dots ---------- */
  function setupCarousel(carousel) {
    if (!carousel) return;

    var dotsId = carousel.getAttribute("data-dots");
    var dotsWrap = dotsId ? document.getElementById(dotsId) : null;
    var cards = Array.prototype.slice.call(carousel.children);
    var isDown = false;
    var startX = 0;
    var scrollLeft = 0;
    var moved = false;
    var dragPointerId = null;

    function isInteractiveTarget(target) {
      return !!(
        target &&
        target.closest &&
        target.closest(
          "button, input, textarea, select, label, [data-open-sheet], .bag-btn, .listing-actions .btn"
        )
      );
    }

    if (dotsWrap && cards.length) {
      dotsWrap.innerHTML = "";
      cards.forEach(function (_, i) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", "Go to slide " + (i + 1));
        if (i === 0) btn.classList.add("is-active");
        btn.addEventListener("click", function () {
          cards[i].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        });
        dotsWrap.appendChild(btn);
      });
    }

    function updateDots() {
      if (!dotsWrap) return;
      var center = carousel.scrollLeft + carousel.clientWidth / 2;
      var best = 0;
      var bestDist = Infinity;
      cards.forEach(function (card, i) {
        var mid = card.offsetLeft + card.offsetWidth / 2;
        var dist = Math.abs(mid - center);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
        dot.classList.toggle("is-active", i === best);
      });
    }

    carousel.addEventListener("scroll", updateDots, { passive: true });

    carousel.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // Never steal taps meant for buy buttons / links (mobile ghost-nav bug).
      if (isInteractiveTarget(e.target)) return;

      isDown = true;
      moved = false;
      dragPointerId = e.pointerId;
      startX = e.clientX;
      scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener("pointermove", function (e) {
      if (!isDown || e.pointerId !== dragPointerId) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) < 8) return;
      if (!moved) {
        moved = true;
        carousel.classList.add("is-dragging");
        try {
          carousel.setPointerCapture(e.pointerId);
        } catch (err) {}
      }
      carousel.scrollLeft = scrollLeft - dx;
    });

    function endDrag(e) {
      if (!isDown || (e && e.pointerId !== dragPointerId)) return;
      isDown = false;
      dragPointerId = null;
      carousel.classList.remove("is-dragging");
      try {
        if (e) carousel.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    carousel.addEventListener("pointerup", endDrag);
    carousel.addEventListener("pointercancel", endDrag);
    carousel.addEventListener(
      "click",
      function (e) {
        if (moved) {
          e.preventDefault();
          e.stopPropagation();
          moved = false;
        }
      },
      true
    );
  }

  document.querySelectorAll(".carousel").forEach(setupCarousel);

  /* ---------- Purchase sheet ---------- */
  var sheet = document.getElementById("sheet");
  var backdrop = document.getElementById("sheetBackdrop");
  var sheetTitle = document.getElementById("sheetTitle");
  var sheetDesc = document.getElementById("sheetDesc");
  var sheetProduct = document.getElementById("sheetProduct");
  var sheetPrice = document.getElementById("sheetPrice");
  var payBtn = document.getElementById("payBtn");

  function openSheetFromEl(el) {
    if (!sheet || !backdrop || !el) return;
    closeContactFn();
    var title = el.getAttribute("data-sheet-title") || "Download the Book";
    var desc =
      el.getAttribute("data-sheet-desc") ||
      "Your own copy, formatted for a calm reading experience.";
    var product = el.getAttribute("data-sheet-product") || "Book";
    var price = el.getAttribute("data-sheet-price") || "";
    var bookSlug = el.getAttribute("data-book-slug") || "";
    var productType = el.getAttribute("data-product-type") || "download";
    if (sheetTitle) sheetTitle.textContent = title;
    if (sheetDesc) sheetDesc.textContent = desc;
    if (sheetProduct) sheetProduct.textContent = product;
    if (sheetPrice) sheetPrice.textContent = price;
    if (payBtn) {
      payBtn.textContent = price ? "Pay " + price : "Continue";
      payBtn.setAttribute("data-book-slug", bookSlug);
      payBtn.setAttribute("data-product-type", productType);
      payBtn.disabled = false;
    }
    sheet.classList.add("open");
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeSheetFn() {
    if (!sheet || !backdrop) return;
    sheet.classList.remove("open");
    backdrop.classList.remove("open");
    if (!contactSheet || !contactSheet.classList.contains("open")) {
      document.body.style.overflow = "";
    }
  }

  document.querySelectorAll("[data-open-sheet]").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
    });
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openSheetFromEl(btn);
    });
  });

  var closeBtn = document.getElementById("closeSheet");
  if (closeBtn) closeBtn.addEventListener("click", closeSheetFn);
  if (backdrop) backdrop.addEventListener("click", closeSheetFn);

  if (payBtn) {
    payBtn.addEventListener("click", function () {
      var slug = payBtn.getAttribute("data-book-slug") || "";
      var productType = payBtn.getAttribute("data-product-type") || "download";
      if (!slug) {
        showToast("Please choose a book again.");
        return;
      }
      if (!window.AuthorThinksPayments) {
        showToast("Payment module failed to load.");
        return;
      }

      payBtn.disabled = true;
      var original = payBtn.textContent;
      payBtn.textContent = "Opening checkout…";

      window.AuthorThinksPayments.startCheckout({
        bookSlug: slug,
        productType: productType,
        onSuccess: function (data) {
          closeSheetFn();
          showToast(
            (data && data.message) || "Payment successful — thank you."
          );
          payBtn.disabled = false;
          payBtn.textContent = original;
        },
        onDismiss: function () {
          payBtn.disabled = false;
          payBtn.textContent = original;
        },
        onError: function (msg) {
          showToast(msg || "Payment failed.");
          payBtn.disabled = false;
          payBtn.textContent = original;
        },
      });
    });
  }

  /* ---------- Contact popup ---------- */
  var contactSheet = document.getElementById("contactSheet");
  var contactBackdrop = document.getElementById("contactBackdrop");
  var contactForm = document.getElementById("contactForm");
  var contactError = document.getElementById("contactError");
  var contactSubmit = document.getElementById("contactSubmit");
  var closeContact = document.getElementById("closeContact");

  function openContact() {
    if (!contactSheet || !contactBackdrop) return;
    closeSheetFn();
    closeMenu();
    contactSheet.classList.add("open");
    contactBackdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    var first = contactForm && contactForm.querySelector("input[name='name']");
    if (first) setTimeout(function () { first.focus(); }, 320);
  }

  function closeContactFn() {
    if (!contactSheet || !contactBackdrop) return;
    contactSheet.classList.remove("open");
    contactBackdrop.classList.remove("open");
    if (!sheet || !sheet.classList.contains("open")) {
      document.body.style.overflow = "";
    }
  }

  document.querySelectorAll("[data-open-contact]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      openContact();
    });
  });

  if (closeContact) closeContact.addEventListener("click", closeContactFn);
  if (contactBackdrop) contactBackdrop.addEventListener("click", closeContactFn);

  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (contactError) {
        contactError.hidden = true;
        contactError.textContent = "";
      }

      var url = contactForm.getAttribute("action") || document.body.getAttribute("data-contact-url");
      var data = new FormData(contactForm);
      if (contactSubmit) {
        contactSubmit.disabled = true;
        contactSubmit.textContent = "Sending…";
      }

      fetch(url, {
        method: "POST",
        body: data,
        headers: {
          Accept: "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        credentials: "same-origin",
      })
        .then(function (res) {
          return res.json().then(function (payload) {
            return { ok: res.ok, status: res.status, payload: payload };
          });
        })
        .then(function (result) {
          if (!result.ok) {
            var errors = (result.payload && result.payload.errors) || {};
            var firstError =
              errors.message || errors.email || errors.name || "Please check the form and try again.";
            if (contactError) {
              contactError.textContent = firstError;
              contactError.hidden = false;
            }
            return;
          }
          contactForm.reset();
          var inquiry = contactForm.querySelector('input[name="kind"][value="inquiry"]');
          if (inquiry) inquiry.checked = true;
          closeContactFn();
          showToast(
            (result.payload && result.payload.message) ||
              "Thank you — your note reached the studio."
          );
        })
        .catch(function () {
          if (contactError) {
            contactError.textContent = "Something went wrong. Please try again.";
            contactError.hidden = false;
          }
        })
        .finally(function () {
          if (contactSubmit) {
            contactSubmit.disabled = false;
            contactSubmit.textContent = "Send note";
          }
        });
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeSheetFn();
      closeContactFn();
      closeMenu();
    }
  });
})();
