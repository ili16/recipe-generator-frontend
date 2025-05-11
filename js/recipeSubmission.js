async function submitRecipe({ endpoint, method = "POST", payload = null, fileInputId = null, imageInputID = null, voiceInputID = null }) {
  showLoading();

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

    hideLoading();
    displayResponse(result.recipename, result.recipe, false);
  } catch (error) {
    hideLoading();
    displayResponse("Error", error.message, true);
  }
}

function submitByName() {
  const recipedescription = document.getElementById("recipedescription").value.trim();

  if (!recipedescription) {
    alert("Recipe Description is required.");
    return;
  }

  submitRecipe({
    endpoint: "generate/by-description",
    payload: { RecipeDescription: recipedescription, IsGerman: isGerman }
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

function showRepromptBox() {
  const reprompt = document.getElementById("repromptContainer");
  reprompt.style.display = reprompt.style.display === "none" ? "block" : "none";
}

async function sendReprompt() {
  const promptText = document.getElementById("repromptInput").value.trim();
  const currentRecipe = document.getElementById("markdownEditor").value.trim();

  if (!promptText || !currentRecipe) {
    alert("Bitte gib sowohl ein Rezept als auch eine neue Anfrage ein.");
    return;
  }

  showLoading();

  try {
    const response = await fetch("/api/v1/update-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipe: currentRecipe,
        changePrompt: promptText
      })
    });

    const data = await response.json();

    if (!data || !data.recipe) throw new Error("Invalid response");

    // Update recipe preview + editor
    document.getElementById("contentArea").innerHTML = marked.parse(data.recipe);
    document.getElementById("markdownEditor").value = data.recipe;

    document.getElementById("repromptInput").value = "";
    document.getElementById("repromptContainer").style.display = "none";

  } catch (err) {
    console.error("Re-prompt error:", err);
    hideLoading();
    alert("Fehler beim erneuten Anfragen der KI.");
  } finally {
    hideLoading();
  }
}

