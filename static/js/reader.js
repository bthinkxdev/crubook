(function () {
  "use strict";

  var bookId = document.body.getAttribute("data-book-id") || "book";
  var storageKey = "at-reader:" + bookId;
  var guideKey = storageKey + ":guided";

  var slots = Array.prototype.slice.call(document.querySelectorAll(".page-slot"));
  var total = slots.length;
  var lockedIndex = total - 1;
  var current = 0;
  var animating = false;
  var chromeHidden = false;
  var edgeHintShown = false;

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

  var toc = [
    { page: 0, label: "Cover", note: "Start" },
    { page: 1, label: "Dedication", note: "Front matter" },
    { page: 2, label: "Introduction", note: "Pages 3–4" },
    { page: 4, label: "Chapter One", note: "Why I Wrote This Book" },
    { page: 6, label: "Continue reading", note: "Unlock", locked: true },
  ];

  function saveProgress() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ page: current, updated: Date.now() })
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
    if (index >= lockedIndex) return "Unlock to continue the story";
    var left = lockedIndex - index;
    if (left === 1) return "1 preview page remaining";
    return left + " preview pages remaining";
  }

  function buildSegments() {
    var wrap = document.getElementById("progressSegments");
    if (!wrap) return;
    wrap.innerHTML = "";
    for (var i = 0; i < total; i++) {
      wrap.appendChild(document.createElement("i"));
    }
  }

  function buildToc() {
    var nav = document.getElementById("tocNav");
    if (!nav) return;
    nav.innerHTML = "";
    toc.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toc-item" + (item.locked ? " is-locked" : "");
      btn.innerHTML =
        "<strong>" +
        item.label +
        "</strong><span>" +
        item.note +
        "</span>";
      btn.addEventListener("click", function () {
        closeToc();
        if (item.locked) {
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
    toc.forEach(function (item, i) {
      if (!items[i]) return;
      var active =
        current === item.page ||
        (item.page === 2 && (current === 2 || current === 3)) ||
        (item.page === 4 && (current === 4 || current === 5));
      items[i].classList.toggle("is-current", active);
    });
  }

  function updateChrome(index) {
    var slot = slots[index];
    var chapter = (slot && slot.getAttribute("data-chapter")) || "";
    chapterLabel.textContent = chapter;
    progressChapter.textContent = chapter;
    pageLabel.textContent = index + 1 + " / " + total;
    progressFill.style.width = ((index + 1) / total) * 100 + "%";
    if (progressTrack) {
      progressTrack.setAttribute("aria-valuenow", String(index + 1));
      progressTrack.setAttribute("aria-valuemax", String(total));
    }
    progressRemain.textContent = remainCopy(index);
    prevBtn.disabled = index === 0;
    nextBtn.disabled = false;
    pageCard.classList.toggle("is-cover", index === 0);
    pageCard.classList.toggle("is-locked", index === lockedIndex);
    syncToc();
  }

  function clearAnimClasses(el) {
    el.classList.remove(
      "active",
      "from-right",
      "from-left",
      "to-left",
      "to-right"
    );
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

    pageCard.classList.add("is-turning");

    var outgoing = slots[prev];
    var incoming = slots[current];

    clearAnimClasses(outgoing);
    clearAnimClasses(incoming);

    outgoing.classList.add(direction === "forward" ? "to-left" : "to-right");
    incoming.classList.add(
      "active",
      direction === "forward" ? "from-right" : "from-left"
    );

    updateChrome(current);
    saveProgress();

    if (current === 1 && !edgeHintShown) {
      showEdgeHint();
    }

    if (current === lockedIndex) {
      setTimeout(openPaywall, 680);
    }

    setTimeout(function () {
      clearAnimClasses(outgoing);
      incoming.classList.remove("from-right", "from-left");
      incoming.classList.add("active");
      pageCard.classList.remove("is-turning");
      animating = false;
    }, 620);
  }

  function next() {
    if (current >= lockedIndex) {
      openPaywall();
      return;
    }
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

  /* Controls */
  document.getElementById("nextBtn").addEventListener("click", next);
  document.getElementById("prevBtn").addEventListener("click", prev);
  document.getElementById("tapLeft").addEventListener("click", function (e) {
    e.stopPropagation();
    if (chromeHidden) {
      setChrome(false);
      return;
    }
    prev();
  });
  document.getElementById("tapRight").addEventListener("click", function (e) {
    e.stopPropagation();
    if (chromeHidden) {
      setChrome(false);
      return;
    }
    next();
  });
  document.getElementById("tapCenter").addEventListener("click", function (e) {
    e.stopPropagation();
    if (current === 0 || current === lockedIndex) return;
    toggleChrome();
  });

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

  /* Swipe with directional threshold */
  var startX = null;
  var startY = null;
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

  /* Font size */
  var sizes = [16, 18, 20, 22];
  var sizeIndex = 1;
  try {
    var savedSize = localStorage.getItem(storageKey + ":size");
    if (savedSize !== null) sizeIndex = Math.min(3, Math.max(0, parseInt(savedSize, 10)));
  } catch (err) {}

  var fontToggle = document.getElementById("fontToggle");
  var fontPop = document.getElementById("fontPop");
  var fontDots = document.querySelectorAll("#fontDots span");

  function applySize() {
    document.documentElement.style.setProperty(
      "--reader-size",
      sizes[sizeIndex] + "px"
    );
    fontDots.forEach(function (d, i) {
      d.classList.toggle("active", i === sizeIndex);
    });
    try {
      localStorage.setItem(storageKey + ":size", String(sizeIndex));
    } catch (err) {}
  }
  applySize();

  function closeFont() {
    if (!fontPop) return;
    fontPop.hidden = true;
    if (fontToggle) fontToggle.setAttribute("aria-expanded", "false");
  }

  fontToggle.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = fontPop.hidden;
    fontPop.hidden = !open;
    fontToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener("click", function (e) {
    if (!fontPop || fontPop.hidden) return;
    if (!fontPop.contains(e.target) && e.target !== fontToggle) closeFont();
  });
  document.getElementById("fontUp").addEventListener("click", function () {
    sizeIndex = Math.min(sizeIndex + 1, sizes.length - 1);
    applySize();
  });
  document.getElementById("fontDown").addEventListener("click", function () {
    sizeIndex = Math.max(sizeIndex - 1, 0);
    applySize();
  });

  /* TOC */
  var tocPanel = document.getElementById("tocPanel");
  var tocBackdrop = document.getElementById("tocBackdrop");
  var tocToggle = document.getElementById("tocToggle");

  function openToc() {
    tocPanel.classList.add("open");
    tocPanel.setAttribute("aria-hidden", "false");
    tocBackdrop.hidden = false;
    requestAnimationFrame(function () {
      tocBackdrop.classList.add("open");
    });
    tocToggle.setAttribute("aria-expanded", "true");
  }
  function closeToc() {
    tocPanel.classList.remove("open");
    tocPanel.setAttribute("aria-hidden", "true");
    tocBackdrop.classList.remove("open");
    tocToggle.setAttribute("aria-expanded", "false");
    setTimeout(function () {
      if (!tocBackdrop.classList.contains("open")) tocBackdrop.hidden = true;
    }, 400);
  }
  tocToggle.addEventListener("click", function () {
    if (tocPanel.classList.contains("open")) closeToc();
    else openToc();
  });
  document.getElementById("tocClose").addEventListener("click", closeToc);
  tocBackdrop.addEventListener("click", closeToc);

  /* Paywall */
  var paywallSheet = document.getElementById("paywallSheet");
  var paywallBackdrop = document.getElementById("paywallBackdrop");

  function openPaywall() {
    setChrome(false);
    paywallSheet.classList.add("open");
    paywallBackdrop.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closePaywall() {
    paywallSheet.classList.remove("open");
    paywallBackdrop.classList.remove("open");
    document.body.style.overflow = "";
  }
  paywallBackdrop.addEventListener("click", closePaywall);
  var closePaywallBtn = document.getElementById("closePaywall");
  if (closePaywallBtn) closePaywallBtn.addEventListener("click", closePaywall);

  var toast = document.getElementById("toast");
  var toastText = document.getElementById("toastText");
  var toastTimer;
  function showToast(msg) {
    toastText.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  document.getElementById("unlockBtn").addEventListener("click", function () {
    closePaywall();
    setTimeout(function () {
      showToast("Payments are coming soon — thank you for your patience.");
    }, 280);
  });

  /* Guidance overlay */
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
  document.getElementById("guideStart").addEventListener("click", function () {
    hideGuide(true);
    if (current === 0) goTo(1, "forward");
    showEdgeHint();
  });
  document.getElementById("guideSkip").addEventListener("click", function () {
    hideGuide(true);
  });

  /* Resume */
  var resumeToast = document.getElementById("resumeToast");
  var resumeText = document.getElementById("resumeText");
  var saved = loadProgress();

  buildSegments();
  buildToc();

  function mountAt(index) {
    slots.forEach(function (slot, i) {
      clearAnimClasses(slot);
      if (i === index) slot.classList.add("active");
    });
    current = index;
    updateChrome(current);
  }

  var guided = false;
  try {
    guided = localStorage.getItem(guideKey) === "1";
  } catch (err) {}

  if (saved && saved.page > 0 && saved.page < total) {
    mountAt(0);
    resumeText.textContent =
      "Page " + (saved.page + 1) + " · " + (slots[saved.page].getAttribute("data-chapter") || "Continue");
    resumeToast.hidden = false;
    document.getElementById("resumeYes").addEventListener("click", function () {
      resumeToast.hidden = true;
      goTo(saved.page, "forward");
    });
    document.getElementById("resumeNo").addEventListener("click", function () {
      resumeToast.hidden = true;
      try {
        localStorage.removeItem(storageKey);
      } catch (err) {}
      if (!guided) showGuide();
    });
  } else {
    mountAt(0);
    if (!guided) showGuide();
  }
})();
