(() => {
  const button = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (button && nav) {
    button.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      button.innerHTML = open
        ? '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>'
        : '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation menu");
      button.innerHTML = '<svg class="ui-icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
    }));
  }
  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  const form = document.querySelector("#enquiry-form");
  if (form) {
    form.addEventListener("submit", event => {
      const phone = form.elements.phone.value.trim().replace(/\D/g, "");
      if (phone.length < 7 || phone.length > 18) {
        event.preventDefault();
        alert("Please enter a valid phone number including your country code.");
        form.elements.phone.focus();
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit) {
        submit.disabled = true;
        const label = submit.querySelector(".submit-label");
        if (label) label.textContent = "Submitting enquiry…";
        else submit.textContent = "Submitting enquiry…";
      }
    });
  }
})();
