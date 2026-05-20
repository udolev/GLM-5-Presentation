const slides = Array.from(document.querySelectorAll(".slide"));
const counter = document.querySelector(".slide-counter");
const progressBar = document.querySelector(".progress-bar");
const prevButton = document.querySelector('[data-action="prev"]');
const nextButton = document.querySelector('[data-action="next"]');
const fullscreenButton = document.querySelector('[data-action="fullscreen"]');
const figureModal = document.querySelector("#figure-modal");
const figureModalTitle = document.querySelector("#figure-modal-title");
const figureModalBody = document.querySelector(".figure-modal-body");
const figureModalCaption = document.querySelector(".figure-modal-caption");

let current = getInitialSlide();

function getInitialSlide() {
  const fromHash = Number.parseInt(window.location.hash.replace("#", ""), 10);
  if (Number.isFinite(fromHash) && fromHash >= 1 && fromHash <= slides.length) {
    return fromHash - 1;
  }
  return 0;
}

function showSlide(index) {
  current = Math.min(Math.max(index, 0), slides.length - 1);

  slides.forEach((slide, slideIndex) => {
    slide.classList.toggle("is-active", slideIndex === current);
  });

  counter.textContent = `${current + 1} / ${slides.length}`;
  progressBar.style.transform = `scaleX(${(current + 1) / slides.length})`;
  prevButton.disabled = current === 0;
  nextButton.disabled = current === slides.length - 1;

  const title = slides[current].dataset.title || `Slide ${current + 1}`;
  document.title = `${title} - GLM-5 Technical Report Seminar`;
  history.replaceState(null, "", `#${current + 1}`);
}

function nextSlide() {
  showSlide(current + 1);
}

function previousSlide() {
  showSlide(current - 1);
}

document.addEventListener("keydown", (event) => {
  if (!figureModal.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFigureModal();
    }
    return;
  }

  if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
    event.preventDefault();
    nextSlide();
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    previousSlide();
  }

  if (event.key === "Home") {
    event.preventDefault();
    showSlide(0);
  }

  if (event.key === "End") {
    event.preventDefault();
    showSlide(slides.length - 1);
  }
});

prevButton.addEventListener("click", previousSlide);
nextButton.addEventListener("click", nextSlide);
fullscreenButton.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.title = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";
  fullscreenButton.setAttribute("aria-label", fullscreenButton.title);
});

document.querySelectorAll(".gallery-card").forEach((card) => {
  card.addEventListener("click", () => openFigureModal(card));
});

document.querySelectorAll("[data-modal-close]").forEach((control) => {
  control.addEventListener("click", closeFigureModal);
});

function openFigureModal(card) {
  const preview = card.querySelector(".figure-preview").cloneNode(true);
  figureModalTitle.textContent = card.dataset.modalTitle;
  figureModalCaption.textContent = card.dataset.modalCaption;
  figureModalBody.replaceChildren(preview);
  figureModal.hidden = false;
  figureModal.querySelector(".modal-close").focus();
}

function closeFigureModal() {
  figureModal.hidden = true;
  figureModalBody.replaceChildren();
}

window.addEventListener("hashchange", () => showSlide(getInitialSlide()));

showSlide(current);
