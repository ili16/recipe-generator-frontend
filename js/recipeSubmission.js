async function submitRecipe({ endpoint, method = "POST", payload = null, fileInputId = null, imageInputID = null, voiceInputID = null }) {
  toggleLoading();

  try {
    let response;
    let options = { method };

    if (imageInputID) {
      const imageInput = document.getElementById(imageInputID);
      const file = imageInput?.files[0];

      const formData = new FormData();
      formData.append("image", file);

      if (payload?.Recipename) formData.append("recipename", payload.Recipename);
      formData.append("isGerman", isGerman);

      options.body = formData;
    } else if (voiceInputID) {

      const voiceInput = document.getElementById(voiceInputID);
      const file = voiceInput?.files[0];
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("isGerman", isGerman);
      options.body = formData;
    } else {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(payload);
    }

    response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/${endpoint}`, options);

    if (!response.ok) {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    toggleLoading();
    displayResponse(result.recipename, result.recipe, false);
  } catch (error) {
    toggleLoading();
    displayResponse("Error", error.message, true);
  }
}

function submitByName() {
  const recipename = document.getElementById("recipename").value.trim();
  const details = document.getElementById("details").value.trim();

  if (!recipename) {
    alert("Recipe name is required.");
    return;
  }

  submitRecipe({
    endpoint: "generate/by-name",
    payload: { Recipename: recipename, Details: details, IsGerman: isGerman }
  });
}

function submitByLink() {
  const url = document.getElementById("url").value.trim();

  if (!url) {
    alert("Recipe link is required.");
    return;
  }

  submitRecipe({
    endpoint: "generate/by-link",
    payload: { URL: url, IsGerman: isGerman }
  });
}

function submitByImage() {
  const recipeName = document.getElementById("recipename-byimage").value.trim();

  if (recipeName.length > 25) {
    alert("Recipe name cannot be longer than 25 characters.");
    return;
  }

  const imageInputID = document.getElementById("image");
  if (!imageInputID.files[0]) {
    alert("Please upload an image.");
    return;
  }

  submitRecipe({
    endpoint: "generate/by-image",
    payload: recipeName ? { Recipename: recipeName } : null,
    imageInputID: "image"
  });
}

function submitVoice() {
  const fileInput = document.getElementById("voice");
  if (!fileInput.files[0]) {
    alert("Please upload a voice recording.");
    return;
  }

  submitRecipe({
    endpoint: "generate/by-voice",
    voiceInputID: "voice"
  });
}
