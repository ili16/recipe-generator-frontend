let editingRecipeId = null;

document.addEventListener("DOMContentLoaded", function () {
    const recipes = JSON.parse(localStorage.getItem("recipes"));
    if (recipes) {
        displayRecipes();
    }
});

function displayRecipes() {
    const recipes = JSON.parse(localStorage.getItem("recipes"));
    const recipeContainer = document.getElementById("recipeContainer");
    recipeContainer.innerHTML = "";

    recipes.forEach(recipe => {
        const recipeCard = document.createElement("div");
        recipeCard.classList.add("recipe-card");
        recipeCard.setAttribute("data-id", recipe.id); // store ID

        const recipeDetails = document.createElement("details");
        recipeDetails.classList.add("recipe-details");

        const summary = document.createElement("summary");
        summary.classList.add("recipe-summary");
        summary.innerText = recipe.recipename;

        const content = document.createElement("div");
        content.innerHTML = marked.parse(recipe.recipe);

        const deleteButton = document.createElement("button");
        deleteButton.classList.add("delete-button");
        deleteButton.innerText = "Delete";
        deleteButton.onclick = function () {
            deleteRecipe(recipe.id, recipeCard);
        };

        const updateButton = document.createElement("button");
        updateButton.classList.add("update-button");
        updateButton.innerText = "Update";
        updateButton.onclick = function () {
            updateRecipe(recipe.id);
        };


        recipeDetails.appendChild(summary);
        recipeDetails.appendChild(content);
        recipeCard.appendChild(recipeDetails);
        recipeCard.appendChild(updateButton);
        recipeCard.appendChild(deleteButton);
        recipeContainer.appendChild(recipeCard);
    });
}

function deleteRecipe(recipeID, recipeElement) {
    showConfirmation(() => confirmDelete(recipeID, recipeElement));
}

async function confirmDelete(recipeID, recipeElement) {
    showLoading();
    try {
        const response = await fetch(`${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/delete-recipe`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recipeID })
        });

        if (!response.ok) {
            throw new Error("Failed to delete recipe");
        }

        recipeElement.remove();
        removeRecipeFromLocalStorage(recipeID);
        closeConfirmation();
        hideLoading();
        hideOverlay();
    } catch (error) {
        hideLoading();
        hideOverlay();
        console.error("Error deleting recipe:", error);
    } finally {
        hideLoading();
        hideOverlay();
    }
}


function removeRecipeFromLocalStorage(recipeID) {
    let recipes = JSON.parse(localStorage.getItem("recipes"));
    recipes = recipes.filter(recipe => recipe.id !== recipeID);
    localStorage.setItem("recipes", JSON.stringify(recipes));
}

function toggleLanguage() {
    const button = document.getElementById("languageToggleButton");
    button.innerText = button.innerText === "Switch to English"
        ? "Zu Deutsch wechseln"
        : "Switch to English";
}

function handleEscapeKey(event) {
    if (event.key === "Escape") {
        closeConfirmation();
        const modal = document.getElementById("importModal");
        if (modal && !modal.classList.contains("hidden")) {
            modal.classList.add("hidden");
            document.removeEventListener("keydown", handleEscapeKey);  // Remove listener to avoid multiple calls
        }
    }
}

function closeConfirmation() {
    document.body.style.overflow = ''; // Restore scroll
    const overlay = document.querySelector(".confirmation-overlay");
    if (overlay) {
        overlay.remove();
    }
}

function showConfirmation(onConfirm) {
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement("div");
    overlay.classList.add("confirmation-overlay");

    const box = document.createElement("div");
    box.classList.add("confirmation-box");

    const message = document.createElement("p");
    message.innerText = "Are you sure you want to delete this recipe?";

    const buttons = document.createElement("div");
    buttons.classList.add("confirmation-buttons");

    const confirmBtn = document.createElement("button");
    confirmBtn.innerText = "Delete";
    confirmBtn.classList.add("confirm-button");
    confirmBtn.onclick = onConfirm;

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.classList.add("cancel-button");
    cancelBtn.onclick = closeConfirmation;

    buttons.appendChild(confirmBtn);
    buttons.appendChild(cancelBtn);

    box.appendChild(message);
    box.appendChild(buttons);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // ESC key support
    document.addEventListener("keydown", handleEscapeKey);
}

document.addEventListener("DOMContentLoaded", function () {
    const modal = document.getElementById("importModal");
    const openBtn = document.getElementById("openImportModal");
    const closeBtn = document.getElementById("closeImportModal");
    const submitBtn = document.getElementById("submitRecipe");

    openBtn.addEventListener("click", () => {
        modal.classList.remove("hidden");
        document.body.style.overflow = 'hidden';
        document.addEventListener("keydown", handleEscapeKey);
    });

    closeBtn.addEventListener("click", () => {
        modal.classList.add("hidden");
        document.removeEventListener("keydown", handleEscapeKey);
    });

    const recipeTextarea = document.getElementById("recipe");
    recipeTextarea.addEventListener("input", () => {
        recipeTextarea.style.height = "auto"; // Reset height
        recipeTextarea.style.height = recipeTextarea.scrollHeight + "px";
    });

    submitBtn.addEventListener("click", async () => {
        const recipename = document.getElementById("recipename").value.trim();
        const recipe = document.getElementById("recipe").value.trim();
        const recipecategory = document.getElementById("category").value.trim();
    
        if (!recipename || !recipe || !recipecategory) {
            alert("Please fill out all fields.");
            return;
        }
    
        const recipeData = {
            recipename,
            recipe,
            recipecategory
        };
    
        try {
            showLoading();
    
            let response;
            if (editingRecipeId) {
                // PATCH update
                response = await fetch("/api/v1/update-recipe", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: editingRecipeId, ...recipeData })
                });
            } else {
                // POST new
                response = await fetch("/api/v1/add-recipe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(recipeData)
                });
            }
    
            if (!response.ok) throw new Error("Failed to submit recipe");
    
            showSuccessToast();
            modal.classList.add("hidden");
    
            // Clear the form
            document.getElementById("recipename").value = "";
            document.getElementById("recipe").value = "";
            document.getElementById("category").value = "";
            document.getElementById("recipe").style.height = "auto"; // reset textarea height
    
            editingRecipeId = null; // reset after submission!
    
            await fetchRecipes();
            displayRecipes();
            hideLoading();
            hideOverlay();
        } catch (error) {
            console.error("Error submitting recipe:", error);
            alert("Could not submit recipe. Check console.");
            hideLoading();
            hideOverlay();
        }
    });
});

function hideOverlay() {
    const overlay = document.getElementById("overlay");
    overlay.style.display = 'none';
}


function showSuccessToast() {
    const toast = document.getElementById("importSuccess");
    toast.classList.remove("hidden");
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.classList.add("hidden"), 500);
    }, 2000);
}

function updateRecipe(recipeID) {
    const recipes = JSON.parse(localStorage.getItem("recipes"));
    const recipeToUpdate = recipes.find(recipe => recipe.id === recipeID);

    if (!recipeToUpdate) {
        alert("Recipe not found.");
        return;
    }

    const modal = document.getElementById("importModal");
    modal.classList.remove("hidden");
    document.body.style.overflow = 'hidden';

    const recipeNameInput = document.getElementById("recipename");
    const recipeContentInput = document.getElementById("recipe");
    const recipeCategoryInput = document.getElementById("category");

    recipeNameInput.value = recipeToUpdate.recipename;
    recipeContentInput.value = recipeToUpdate.recipe;
    recipeCategoryInput.value = recipeToUpdate.category;

    editingRecipeId = recipeID;

    document.addEventListener("keydown", handleEscapeKey);
}

