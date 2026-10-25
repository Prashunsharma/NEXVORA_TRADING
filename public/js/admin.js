// Nexvora admin panel helpers:
// - Confirm dialogs on destructive forms (class "js-confirm").
// - Cloudinary direct uploads: when a file is picked inside an ".image-field"
//   block, ask the server for a one-time signature, upload the file straight
//   to Cloudinary, then fill the form's image URL + public id fields and
//   refresh the preview. If anything fails, the manual URL field stays
//   fully usable — uploading is a convenience, never a requirement.
(() => {
  document.querySelectorAll("form.js-confirm").forEach((form) => {
    form.addEventListener("submit", (event) => {
      const message = form.getAttribute("data-confirm") || "Are you sure?";
      if (!window.confirm(message)) event.preventDefault();
    });
  });

  document.querySelectorAll(".image-field").forEach((field) => {
    const fileInput = field.querySelector("[data-image-file]");
    const urlInput = field.querySelector("[data-image-url]");
    const publicIdInput = field.querySelector("[data-image-public-id]");
    const preview = field.querySelector("[data-image-preview]");
    const status = field.querySelector("[data-upload-status]");
    if (!fileInput || !urlInput) return;
    const folder = field.getAttribute("data-folder") || "nexvora/offers";

    function showPreview() {
      if (!preview) return;
      if (urlInput.value) {
        preview.src = urlInput.value;
        preview.hidden = false;
      } else {
        preview.removeAttribute("src");
        preview.hidden = true;
      }
    }
    urlInput.addEventListener("change", showPreview);

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (status) status.textContent = "Uploading image…";
      try {
        const signResponse = await fetch(`/admin/cloudinary-sign?folder=${encodeURIComponent(folder)}`, {
          headers: { Accept: "application/json" }
        });
        if (!signResponse.ok) throw new Error("Could not get an upload signature.");
        const sign = await signResponse.json();

        const formData = new FormData();
        formData.append("file", file);
        formData.append("api_key", sign.apiKey);
        formData.append("timestamp", String(sign.timestamp));
        formData.append("signature", sign.signature);
        formData.append("folder", sign.folder);

        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, {
          method: "POST",
          body: formData
        });
        if (!uploadResponse.ok) throw new Error("Cloudinary rejected the upload.");
        const result = await uploadResponse.json();
        urlInput.value = result.secure_url;
        if (publicIdInput) publicIdInput.value = result.public_id;
        if (status) status.textContent = "Image uploaded — remember to save the form.";
        showPreview();
      } catch (error) {
        if (status) status.textContent = "Upload failed. You can paste an image URL instead.";
      }
    });
  });
})();
