(function () {
  const body = document.body;
  const page = body.dataset.page;
  const nav = document.getElementById("site-nav");
  const toggle = document.querySelector(".nav-toggle");

  if (page && nav) {
    const links = nav.querySelectorAll("a");
    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (
        href === "/" ? page === "home" : href && window.location.pathname.startsWith(href)
      ) {
        link.classList.add("is-active");
      }
    });
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }
})();
