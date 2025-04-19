document.addEventListener("DOMContentLoaded", function () {
    const recipes = JSON.parse(localStorage.getItem("recipes"));
    if (recipes) {
        displayRecipes(recipes);
    }
});

function displayRecipes(recipes) {
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

        recipeDetails.appendChild(summary);
        recipeDetails.appendChild(content);
        recipeCard.appendChild(recipeDetails);
        recipeCard.appendChild(deleteButton);
        recipeContainer.appendChild(recipeCard);
    });
}

function handleEscapeKey(event) {
    if (event.key === "Escape") {
        closeConfirmation();
    }
}


function deleteRecipe(recipeID, recipeElement) {
    showConfirmation(() => confirmDelete(recipeID, recipeElement));
}

async function confirmDelete(recipeID, recipeElement) {
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
    } catch (error) {
        console.error("Error deleting recipe:", error);
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

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("importModal");
    const openBtn = document.getElementById("openImportModal");
    const closeBtn = document.getElementById("closeImportModal");
    const submitBtn = document.getElementById("submitRecipe");

    openBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

    const recipeTextarea = document.getElementById("recipe");

    recipeTextarea.addEventListener("input", () => {
        recipeTextarea.style.height = "auto"; // Reset
        recipeTextarea.style.height = recipeTextarea.scrollHeight + "px";
    });

    submitBtn.addEventListener("click", async () => {
        const recipename = document.getElementById("recipename").value.trim();
        const recipe = document.getElementById("recipe").value.trim();
        const category = document.getElementById("category").value.trim();

        if (!recipename || !recipe || !category) {
            alert("Please fill out all fields.");
            return;
        }

        const newRecipe = {
            id: Date.now().toString(), // unique ID
            recipename,
            recipe,
            category
        };

        try {
            const response = await fetch("/api/v1/add-recipe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newRecipe)
            });

            if (!response.ok) throw new Error("Failed to add recipe");

            // Update local storage
            const stored = JSON.parse(localStorage.getItem("recipes")) || [];
            stored.push(newRecipe);
            localStorage.setItem("recipes", JSON.stringify(stored));

            displayRecipes(stored);
            modal.classList.add("hidden");
        } catch (error) {
            console.error("Error adding recipe:", error);
            alert("Could not add recipe. Check console.");
        }
    });
});
