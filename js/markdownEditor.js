document.addEventListener("DOMContentLoaded", function () {
  const markdownEditor = document.getElementById("markdownEditor");
  const contentArea = document.getElementById("contentArea");

  function toggleEditor() {
    const editorContainer = document.getElementById("editorContainer");
    const recipeName = document.getElementById("recipeName");
    const recipeNameInput = document.getElementById("recipeNameInput");

    if (editorContainer.style.display === "none") {
      editorContainer.style.display = "block";
    } else {
      editorContainer.style.display = "none";
    }

    if (recipeName.style.display !== "none") {
      recipeNameInput.value = recipeName.innerText;
      recipeName.style.display = "none";
      recipeNameInput.style.display = "block";
      recipeNameInput.focus();
    } else {
      recipeName.innerText = recipeNameInput.value;
      recipeName.style.display = "block";
      recipeNameInput.style.display = "none";
    }
  }


  function updatePreview() {
    contentArea.innerHTML = marked.parse(markdownEditor.value);
  }

  async function acceptFunction() {
    const recipename = document.getElementById("recipeName").textContent.trim();
    const recipe = document.getElementById("markdownEditor").value.trim();

    if (!recipename || !recipe) {
      alert("Recipe name and content cannot be empty.");
      return;
    }

    const payload = { recipename, recipe };

    try {
      const response = await fetch("/api/v1/add-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      showSuccessMessage("Recipe added successfully!");

      closeBox();
    } catch (error) {
      alert("Failed to add recipe: " + error.message);
    }
    fetchRecipes();
    clearInputs();
  }

  function clearInputs() {
    // Clear text inputs
    document.querySelectorAll('input[type="text"], input[type="url"]').forEach(input => input.value = '');
  
    // Clear text areas
    document.querySelectorAll('textarea').forEach(textarea => textarea.value = '');
  
    // Reset placeholders
    document.getElementsByName("generateByName-details")[0].placeholder = isGerman
      ? "Füge Details oder Vorlieben hinzu"
      : "Add details or preferences";
  
    // Reset file inputs
    document.querySelectorAll('input[type="file"]').forEach(fileInput => fileInput.value = '');
  
    // Reset drop zone text
    document.getElementById("dropZone").innerText = isGerman ? "Bild auswählen" : "Drag and drop an image here, or click to select one.";
  }

  function closeBox() {
    document.getElementById('overlay').style.display = 'none';
    let contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '';

    let editArea = document.getElementById('markdownEditor');
    editArea.value = '';
    document.body.style.overflow = '';
  }


  markdownEditor.addEventListener("input", updatePreview);

  window.toggleEditor = toggleEditor;
  window.acceptFunction = acceptFunction;
  window.closeBox = closeBox;

  function showSuccessMessage(message) {
    const successBox = document.createElement("div");
    successBox.textContent = message;
    successBox.style.position = "fixed";
    successBox.style.top = "20px";
    successBox.style.right = "20px";
    successBox.style.padding = "10px 20px";
    successBox.style.background = "green";
    successBox.style.color = "white";
    successBox.style.borderRadius = "5px";
    successBox.style.zIndex = "2000";
    document.body.appendChild(successBox);

    setTimeout(() => {
      successBox.remove();
    }, 10000); // Remove after 10 seconds

    successBox.addEventListener("click", () => successBox.remove()); // Click to close
  }
});
