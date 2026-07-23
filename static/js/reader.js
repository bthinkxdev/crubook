/**
 * author.thinks reader — full book with free preview + paid unlock
 */
(function () {
  "use strict";

  var bookId = document.body.getAttribute("data-book-id") || "book";
  var storageKey = "at-reader:" + bookId;
  var guideKey = storageKey + ":guided";
  var unlockKey = storageKey + ":access";
  var legacyUnlockKey = storageKey + ":unlocked";

  var allSlots = Array.prototype.slice.call(
    document.querySelectorAll(".page-slot")
  );
  var slots = [];
  var total = 0;
  var bookTotal = 0;
  var lockedIndex = 0;
  var isUnlocked = false;
  var accessToken = "";
  var current = 0;
  var animating = false;
  var chromeHidden = false;
  var edgeHintShown = false;
  var firstPaidIndex = -1;

  var pageLabel = document.getElementById("pageLabel");
  var progressFill = document.getElementById("progressFill");
  var progressTrack = document.getElementById("progressTrack");
  var progressChapter = document.getElementById("progressChapter");
  var progressRemain = document.getElementById("progressRemain");
  var chapterLabel = document.getElementById("chapterLabel");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var pageCard = document.getElementById("pageCard");
  var edgeHint = document.getElementById("edgeHint");
  var tocNote = document.querySelector(".toc-note");

  try {
    accessToken = localStorage.getItem(unlockKey) || "";
    if (!accessToken && localStorage.getItem(legacyUnlockKey) === "1") {
      isUnlocked = true;
    }
  } catch (err) {}

  function accessUrlFor(token) {
    var tpl =
      document.body.getAttribute("data-payment-access-base") ||
      "/payments/access/00000000-0000-0000-0000-000000000000/";
    return tpl.replace("00000000-0000-0000-0000-000000000000", token);
  }

  function validateAccessToken(token) {
    if (!token) return Promise.resolve(false);
    return fetch(accessUrlFor(token), {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return !!(
            res.ok &&
            data &&
            data.ok &&
            (!data.book_slug || data.book_slug === bookId)
          );
        });
      })
      .catch(function () {
        return false;
      });
  }

  function rebuildSlots() {
    if (isUnlocked) {
      slots = allSlots.filter(function (slot) {
        return slot.getAttribute("data-access") !== "gate";
      });
    } else {
      slots = allSlots.filter(function (slot) {
        var access = slot.getAttribute("data-access");
        return access === "free" || access === "gate";
      });
    }

    slots.forEach(function (slot, i) {
      slot.setAttribute("data-page", String(i));
      slot.classList.toggle("active", false);
      slot.classList.remove("from-right", "from-left", "to-left", "to-right");
    });

    allSlots.forEach(function (slot) {
      if (slots.indexOf(slot) === -1) {
        slot.classList.remove("active", "from-right", "from-left", "to-left", "to-right");
        slot.setAttribute("aria-hidden", "true");
      } else {
        slot.removeAttribute("aria-hidden");
      }
    });

    total = slots.length;
    bookTotal = allSlots.filter(function (slot) {
      return slot.getAttribute("data-access") !== "gate";
    }).length;
    lockedIndex = -1;
    firstPaidIndex = -1;

    for (var i = 0; i < slots.length; i++) {
      if (slots[i].getAttribute("data-access") === "gate") {
        lockedIndex = i;
      }
      if (
        firstPaidIndex < 0 &&
        slots[i].getAttribute("data-access") === "paid"
      ) {
        firstPaidIndex = i;
      }
    }

    if (isUnlocked) {
      lockedIndex = total + 1;
    } else if (lockedIndex < 0) {
      lockedIndex = Math.max(0, total - 1);
    }

    if (tocNote) {
      tocNote.textContent = isUnlocked
        ? "Full book unlocked — every chapter is open."
        : "Free preview includes the opening pages. Unlock anytime to continue.";
    }
  }

  function chapterToc() {
    var items = [];
    var seen = {};
    slots.forEach(function (slot, i) {
      if (slot.getAttribute("data-access") === "gate") {
        items.push({
          page: i,
          label: "Continue reading",
          note: "Unlock",
          locked: true,
        });
        return;
      }
      var chapter = slot.getAttribute("data-chapter") || "";
      var section = slot.getAttribute("data-section") || "";
      if (!chapter || seen[chapter]) return;
      // Prefer first page of a section / chapter
      if (
        section === "cover" ||
        section === "copyright" ||
        section === "contents" ||
        section === "note" ||
        section === "dedication" ||
        section === "intro" ||
        section.indexOf("ch") === 0 ||
        section === "close"
      ) {
        seen[chapter] = true;
        items.push({
          page: i,
          label: chapter,
          note: slot.getAttribute("data-toc-note") || "",
          locked: false,
        });
      }
    });
    return items;
  }

  function saveProgress() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ page: current, updated: Date.now(), unlocked: isUnlocked })
      );
    } catch (err) {}
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function vibrateSoft() {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (err) {}
    }
  }

  function remainCopy(index) {
    if (index === 0) return "Begin when you're ready";
    if (!isUnlocked && index >= lockedIndex) return "Unlock to continue the story";
    var leftAll = bookTotal - (index + 1);
    if (leftAll <= 0) return "End of the book";
    if (leftAll === 1) return "1 page remaining";
    return leftAll + " pages remaining";
  }

  function buildSegments() {
    /* Continuous progress only — segment ticks look noisy with 40+ pages. */
  }

  function buildToc() {
    var nav = document.getElementById("tocNav");
    if (!nav) return;
    nav.innerHTML = "";
    chapterToc().forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toc-item" + (item.locked ? " is-locked" : "");
      btn.innerHTML =
        "<strong>" +
        item.label +
        "</strong><span>" +
        (item.note || "") +
        "</span>";
      btn.addEventListener("click", function () {
        closeToc();
        if (item.locked && !isUnlocked) {
          goTo(lockedIndex, "forward");
          return;
        }
        goTo(item.page, item.page > current ? "forward" : "back");
      });
      nav.appendChild(btn);
    });
  }

  function syncToc() {
    var items = document.querySelectorAll(".toc-item");
    var toc = chapterToc();
    toc.forEach(function (item, i) {
      if (!items[i]) return;
      var slot = slots[current];
      var chapter = slot ? slot.getAttribute("data-chapter") : "";
      items[i].classList.toggle(
        "is-current",
        current === item.page || (!item.locked && item.label === chapter)
      );
    });
  }

  function updateChrome(index) {
    var slot = slots[index];
    var chapter = (slot && slot.getAttribute("data-chapter")) || "";
    if (chapterLabel) chapterLabel.textContent = chapter;
    if (progressChapter) progressChapter.textContent = chapter;
    if (pageLabel) pageLabel.textContent = index + 1 + " / " + bookTotal;
    if (progressFill) {
      progressFill.style.width =
        ((index + 1) / Math.max(bookTotal, 1)) * 100 + "%";
    }
    if (progressTrack) {
      progressTrack.setAttribute("aria-valuenow", String(index + 1));
      progressTrack.setAttribute("aria-valuemax", String(bookTotal));
    }
    if (progressRemain) progressRemain.textContent = remainCopy(index);
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) {
      if (!isUnlocked && index === lockedIndex) {
        nextBtn.disabled = false;
      } else {
        nextBtn.disabled = index >= total - 1;
      }
    }
    if (pageCard) {
      pageCard.classList.toggle("is-cover", index === 0);
      pageCard.classList.toggle(
        "is-locked",
        !isUnlocked && index === lockedIndex
      );
    }
    syncToc();
  }

  function clearAnimClasses(el) {
    if (!el) return;
    el.classList.remove(
      "active",
      "from-right",
      "from-left",
      "to-left",
      "to-right"
    );
  }

  function showActiveInstant(index) {
    slots.forEach(function (slot, i) {
      clearAnimClasses(slot);
      if (i === index) slot.classList.add("active");
    });
    current = index;
    updateChrome(current);
  }

  function goTo(index, direction) {
    if (animating) return;
    if (index < 0 || index >= total) return;
    if (index === current) return;

    direction = direction || (index > current ? "forward" : "back");
    var prev = current;
    current = index;
    animating = true;
    vibrateSoft();

    if (pageCard) pageCard.classList.add("is-turning");

    var outgoing = slots[prev];
    var incoming = slots[current];

    clearAnimClasses(outgoing);
    clearAnimClasses(incoming);

    if (outgoing) {
      outgoing.classList.add(direction === "forward" ? "to-left" : "to-right");
    }
    if (incoming) {
      incoming.classList.add(
        "active",
        direction === "forward" ? "from-right" : "from-left"
      );
    }

    updateChrome(current);
    saveProgress();

    if (current === 1 && !edgeHintShown) {
      showEdgeHint();
    }

    if (!isUnlocked && current === lockedIndex) {
      setTimeout(openPaywall, 680);
    }

    setTimeout(function () {
      clearAnimClasses(outgoing);
      if (incoming) {
        incoming.classList.remove("from-right", "from-left");
        incoming.classList.add("active");
      }
      if (pageCard) pageCard.classList.remove("is-turning");
      animating = false;
    }, 620);
  }

  function next() {
    if (!isUnlocked && current >= lockedIndex) {
      openPaywall();
      return;
    }
    if (current >= total - 1) return;
    goTo(current + 1, "forward");
  }

  function prev() {
    goTo(current - 1, "back");
  }

  function showEdgeHint() {
    if (!edgeHint || edgeHintShown) return;
    edgeHintShown = true;
    edgeHint.classList.add("is-visible");
    setTimeout(function () {
      edgeHint.classList.remove("is-visible");
    }, 3200);
  }

  function setChrome(hidden) {
    chromeHidden = hidden;
    document.body.classList.toggle("chrome-hidden", hidden);
  }

  function toggleChrome() {
    if (current === 0) return;
    setChrome(!chromeHidden);
  }

  function applyUnlock(options) {
    options = options || {};
    var wasLocked = !isUnlocked;
    isUnlocked = true;
    var resumePage = current;
    rebuildSlots();
    buildSegments();
    buildToc();

    var target = resumePage;
    if (options.jumpToPaid && firstPaidIndex >= 0) {
      target = firstPaidIndex;
    } else if (target >= total) {
      target = Math.max(0, total - 1);
    }

    // Remap: if we were on the gate, jump to first paid page
    showActiveInstant(target);
    if (pageCard) pageCard.classList.remove("is-locked");
    saveProgress();
    return wasLocked;
  }

  /* Controls */
  if (nextBtn) nextBtn.addEventListener("click", next);
  if (prevBtn) prevBtn.addEventListener("click", prev);

  var tapLeft = document.getElementById("tapLeft");
  var tapRight = document.getElementById("tapRight");
  var tapCenter = document.getElementById("tapCenter");

  if (tapLeft) {
    tapLeft.addEventListener("click", function (e) {
      e.stopPropagation();
      if (chromeHidden) {
        setChrome(false);
        return;
      }
      prev();
    });
  }
  if (tapRight) {
    tapRight.addEventListener("click", function (e) {
      e.stopPropagation();
      if (chromeHidden) {
        setChrome(false);
        return;
      }
      next();
    });
  }
  if (tapCenter) {
    tapCenter.addEventListener("click", function (e) {
      e.stopPropagation();
      if (current === 0 || (!isUnlocked && current === lockedIndex)) return;
      toggleChrome();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
    if (e.key === "Escape") {
      closePaywall();
      closeToc();
      closeFont();
      setChrome(false);
    }
  });

  var startX = null;
  var startY = null;
  if (pageCard) {
    pageCard.addEventListener(
      "touchstart",
      function (e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      },
      { passive: true }
    );
    pageCard.addEventListener(
      "touchend",
      function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        var dy = e.changedTouches[0].clientY - startY;
        startX = null;
        startY = null;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        if (chromeHidden) {
          setChrome(false);
          return;
        }
        if (dx < 0) next();
        else prev();
      },
      { passive: true }
    );
  }

  /* Font size */
  var sizes = [16, 18, 20, 22];
  var sizeIndex = 1;
  try {
    var savedSize = localStorage.getItem(storageKey + ":size");
    if (savedSize !== null) sizeIndex = Math.min(3, Math.max(0, parseInt(savedSize, 10) || 1));
  } catch (err) {}

  function applyFont() {
    document.body.style.setProperty("--reader-size", sizes[sizeIndex] + "px");
    var dots = document.querySelectorAll("#fontDots span");
    dots.forEach(function (dot, i) {
      dot.classList.toggle("is-on", i <= sizeIndex);
    });
    try {
      localStorage.setItem(storageKey + ":size", String(sizeIndex));
    } catch (err) {}
  }

  var fontToggle = document.getElementById("fontToggle");
  var fontPop = document.getElementById("fontPop");
  var fontUp = document.getElementById("fontUp");
  var fontDown = document.getElementById("fontDown");

  function closeFont() {
    if (!fontPop || !fontToggle) return;
    fontPop.hidden = true;
    fontToggle.setAttribute("aria-expanded", "false");
  }

  if (fontToggle && fontPop) {
    fontToggle.addEventListener("click", function () {
      var open = fontPop.hidden;
      fontPop.hidden = !open;
      fontToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  if (fontUp) {
    fontUp.addEventListener("click", function () {
      sizeIndex = Math.min(sizes.length - 1, sizeIndex + 1);
      applyFont();
    });
  }
  if (fontDown) {
    fontDown.addEventListener("click", function () {
      sizeIndex = Math.max(0, sizeIndex - 1);
      applyFont();
    });
  }

  /* TOC */
  var tocPanel = document.getElementById("tocPanel");
  var tocBackdrop = document.getElementById("tocBackdrop");
  var tocToggle = document.getElementById("tocToggle");
  var tocClose = document.getElementById("tocClose");

  function openToc() {
    if (!tocPanel) return;
    tocPanel.classList.add("open");
    tocPanel.setAttribute("aria-hidden", "false");
    if (tocBackdrop) tocBackdrop.hidden = false;
    if (tocToggle) tocToggle.setAttribute("aria-expanded", "true");
  }
  function closeToc() {
    if (!tocPanel) return;
    tocPanel.classList.remove("open");
    tocPanel.setAttribute("aria-hidden", "true");
    if (tocBackdrop) tocBackdrop.hidden = true;
    if (tocToggle) tocToggle.setAttribute("aria-expanded", "false");
  }
  if (tocToggle) tocToggle.addEventListener("click", openToc);
  if (tocClose) tocClose.addEventListener("click", closeToc);
  if (tocBackdrop) tocBackdrop.addEventListener("click", closeToc);

  /* Paywall */
  var paywallSheet = document.getElementById("paywallSheet");
  var paywallBackdrop = document.getElementById("paywallBackdrop");

  function openPaywall() {
    if (isUnlocked || !paywallSheet || !paywallBackdrop) return;
    paywallSheet.classList.add("open");
    paywallBackdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closePaywall() {
    if (!paywallSheet || !paywallBackdrop) return;
    paywallSheet.classList.remove("open");
    paywallBackdrop.classList.remove("open");
    document.body.style.overflow = "";
  }
  if (paywallBackdrop) paywallBackdrop.addEventListener("click", closePaywall);
  var closePaywallBtn = document.getElementById("closePaywall");
  if (closePaywallBtn) closePaywallBtn.addEventListener("click", closePaywall);

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

  function wireBeginAndPaywall() {
    var beginBtn = document.getElementById("beginBtn");
    if (beginBtn) {
      beginBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        hideGuide(true);
        goTo(1, "forward");
        showEdgeHint();
      });
    }
    var paywallOpenBtn = document.getElementById("paywallOpenBtn");
    if (paywallOpenBtn) {
      paywallOpenBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPaywall();
      });
    }
  }

  var unlockBtn = document.getElementById("unlockBtn");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", function () {
      var btn = unlockBtn;
      var slug =
        btn.getAttribute("data-book-slug") ||
        document.body.getAttribute("data-book-id") ||
        "";
      if (!window.AuthorThinksPayments) {
        showToast("Payment module failed to load.");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Opening checkout…";

      window.AuthorThinksPayments.startCheckout({
        bookSlug: slug,
        productType: "online",
        onSuccess: function (data) {
          if (data && data.access_token) {
            try {
              localStorage.setItem(unlockKey, data.access_token);
              localStorage.removeItem(legacyUnlockKey);
            } catch (err) {}
            accessToken = data.access_token;
          }
          closePaywall();
          applyUnlock({ jumpToPaid: true });
          showToast((data && data.message) || "Unlocked — enjoy reading.");
          btn.disabled = false;
          var priceEl = document.querySelector("#paywallSheet .value");
          btn.textContent =
            "Unlock for " + ((priceEl && priceEl.textContent) || "₹49");
        },
        onDismiss: function () {
          btn.disabled = false;
          var priceEl = document.querySelector("#paywallSheet .value");
          btn.textContent =
            "Unlock for " + ((priceEl && priceEl.textContent) || "₹49");
        },
        onError: function (msg) {
          showToast(msg || "Payment failed. You can retry safely.");
          btn.disabled = false;
          var priceEl = document.querySelector("#paywallSheet .value");
          btn.textContent =
            "Unlock for " + ((priceEl && priceEl.textContent) || "₹49");
        },
      });
    });
  }

  /* Guidance */
  var guideOverlay = document.getElementById("guideOverlay");
  function showGuide() {
    if (!guideOverlay) return;
    guideOverlay.hidden = false;
  }
  function hideGuide(markDone) {
    if (!guideOverlay) return;
    guideOverlay.hidden = true;
    if (markDone) {
      try {
        localStorage.setItem(guideKey, "1");
      } catch (err) {}
    }
  }
  var guideStart = document.getElementById("guideStart");
  var guideSkip = document.getElementById("guideSkip");
  if (guideStart) {
    guideStart.addEventListener("click", function () {
      hideGuide(true);
      if (current === 0) goTo(1, "forward");
      showEdgeHint();
    });
  }
  if (guideSkip) {
    guideSkip.addEventListener("click", function () {
      hideGuide(true);
    });
  }

  /* Resume */
  var resumeToast = document.getElementById("resumeToast");
  var resumeYes = document.getElementById("resumeYes");
  var resumeNo = document.getElementById("resumeNo");

  function initReader() {
    rebuildSlots();
    buildSegments();
    buildToc();
    wireBeginAndPaywall();
    applyFont();
    showActiveInstant(0);

    var guided = false;
    try {
      guided = localStorage.getItem(guideKey) === "1";
    } catch (err) {}

    var progress = loadProgress();
    if (progress && progress.page > 0 && progress.page < total) {
      if (resumeToast) {
        resumeToast.hidden = false;
        if (resumeYes) {
          resumeYes.onclick = function () {
            resumeToast.hidden = true;
            hideGuide(true);
            showActiveInstant(progress.page);
          };
        }
        if (resumeNo) {
          resumeNo.onclick = function () {
            resumeToast.hidden = true;
            try {
              localStorage.removeItem(storageKey);
            } catch (err) {}
            showActiveInstant(0);
            if (!guided) showGuide();
          };
        }
      } else {
        showActiveInstant(progress.page);
      }
    } else if (!guided) {
      showGuide();
    }
  }

  if (accessToken) {
    validateAccessToken(accessToken).then(function (ok) {
      if (ok) {
        isUnlocked = true;
      } else {
        try {
          localStorage.removeItem(unlockKey);
        } catch (err) {}
        accessToken = "";
      }
      initReader();
    });
  } else {
    initReader();
  }
})();
